import type { Workflow, WorkflowExecution, WSMessage, NodeResult, AgentMemory, MemoryEntry, Artifact, WorkflowTemplate } from '../types';
import { runAgent } from '../ai/agents';
import { WORKFLOW_TEMPLATES } from '../types';

export class WorkflowDO {
  private state: DurableObjectState;
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private websockets: Map<string, WebSocket[]> = new Map();
  private memories: Map<string, AgentMemory> = new Map();
  private artifacts: Map<string, Artifact[]> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.list();
      for (const [key, value] of stored) {
        if (key.startsWith('wf:')) {
          this.workflows.set(key.slice(3), value as Workflow);
        } else if (key.startsWith('ex:')) {
          this.executions.set(key.slice(3), value as WorkflowExecution);
        } else if (key.startsWith('mem:')) {
          this.memories.set(key.slice(4), value as AgentMemory);
        } else if (key.startsWith('art:')) {
          this.artifacts.set(key.slice(4), value as Artifact[]);
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for live execution
    if (url.pathname === '/ws') {
      return this.handleWebSocket(request);
    }

    // Save workflow
    if (url.pathname === '/save' && request.method === 'POST') {
      const workflow = await request.json() as Workflow;
      this.workflows.set(workflow.id, workflow);
      await this.state.storage.put(`wf:${workflow.id}`, workflow);
      return Response.json({ success: true });
    }

    // Get workflow
    if (url.pathname === '/get' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      const workflow = id ? this.workflows.get(id) : null;
      return Response.json(workflow || { error: 'Not found' });
    }

    // List workflows
    if (url.pathname === '/list' && request.method === 'GET') {
      return Response.json(Array.from(this.workflows.values()));
    }

    // List templates
    if (url.pathname === '/templates' && request.method === 'GET') {
      return Response.json(WORKFLOW_TEMPLATES);
    }

    // Get template
    if (url.pathname === '/template' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      const template = WORKFLOW_TEMPLATES.find((t) => t.id === id);
      return Response.json(template || { error: 'Not found' });
    }

    // Execute workflow
    if (url.pathname === '/execute' && request.method === 'POST') {
      const body = await request.json() as { workflowId: string; input: string };
      const executionId = crypto.randomUUID();
      const execution: WorkflowExecution = {
        id: executionId,
        workflowId: body.workflowId,
        status: 'running',
        results: {},
        startedAt: Date.now(),
      };
      this.executions.set(executionId, execution);
      await this.state.storage.put(`ex:${executionId}`, execution);

      // Start execution asynchronously
      this.executeWorkflow(executionId, body.workflowId, body.input);

      return Response.json({ executionId });
    }

    // Get execution status
    if (url.pathname === '/status' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      const execution = id ? this.executions.get(id) : null;
      return Response.json(execution || { error: 'Not found' });
    }

    // Get artifacts for an execution
    if (url.pathname === '/artifacts' && request.method === 'GET') {
      const executionId = url.searchParams.get('executionId');
      const arts = executionId ? this.artifacts.get(executionId) || [] : [];
      return Response.json(arts);
    }

    // Get memory for an agent type
    if (url.pathname === '/memory' && request.method === 'GET') {
      const agentType = url.searchParams.get('agentType');
      const mem = agentType ? this.memories.get(agentType) : null;
      return Response.json(mem || { agentType, entries: [] });
    }

    // Clear memory for an agent type
    if (url.pathname === '/memory' && request.method === 'DELETE') {
      const agentType = url.searchParams.get('agentType');
      if (agentType) {
        this.memories.delete(agentType);
        await this.state.storage.delete(`mem:${agentType}`);
      }
      return Response.json({ success: true });
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const executionId = new URL(request.url).searchParams.get('executionId');
    if (!executionId) {
      return new Response('Missing executionId', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    if (!this.websockets.has(executionId)) {
      this.websockets.set(executionId, []);
    }
    this.websockets.get(executionId)!.push(server);

    // Send current state
    const execution = this.executions.get(executionId);
    if (execution) {
      for (const [nodeId, result] of Object.entries(execution.results)) {
        const msg: WSMessage = {
          type: result.status === 'done' ? 'node_done' : result.status === 'error' ? 'node_error' : 'node_output',
          executionId,
          nodeId,
          output: result.output,
          error: result.error,
          timestamp: Date.now(),
        };
        server.send(JSON.stringify(msg));
      }
    }

    server.addEventListener('close', () => {
      const sockets = this.websockets.get(executionId) || [];
      const idx = sockets.indexOf(server);
      if (idx >= 0) sockets.splice(idx, 1);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(executionId: string, message: WSMessage) {
    const sockets = this.websockets.get(executionId) || [];
    const dead: WebSocket[] = [];

    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        dead.push(ws);
      }
    }

    for (const ws of dead) {
      const idx = sockets.indexOf(ws);
      if (idx >= 0) sockets.splice(idx, 1);
    }
  }

  private async executeWorkflow(executionId: string, workflowId: string, input: string) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      this.broadcast(executionId, {
        type: 'workflow_error',
        executionId,
        error: 'Workflow not found',
        timestamp: Date.now(),
      });
      return;
    }

    const execution = this.executions.get(executionId)!;
    const nodeOutputs: Record<string, string> = {};

    try {
      // Build adjacency list
      const adjacency = new Map<string, string[]>();
      const inDegree = new Map<string, number>();

      for (const node of workflow.nodes) {
        adjacency.set(node.id, []);
        inDegree.set(node.id, 0);
      }

      for (const edge of workflow.edges) {
        adjacency.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }

      // Find root nodes (no incoming edges)
      const queue: string[] = [];
      for (const [nodeId, deg] of inDegree) {
        if (deg === 0) queue.push(nodeId);
      }

      // Topological execution with parallel branches
      const completed = new Set<string>();
      const running = new Set<string>();

      while (completed.size < workflow.nodes.length) {
        // Start all ready nodes
        const ready = queue.filter((id) => !completed.has(id) && !running.has(id));

        if (ready.length === 0 && running.size === 0) {
          break; // Deadlock or done
        }

        // Execute ready nodes in parallel
        await Promise.all(
          ready.map(async (nodeId) => {
            running.add(nodeId);
            const node = workflow.nodes.find((n) => n.id === nodeId)!;

            // Gather inputs from all parent nodes
            const parentEdges = workflow.edges.filter((e) => e.target === nodeId);
            const parentInputs = parentEdges.map((e) => nodeOutputs[e.source] || '').filter(Boolean);
            const nodeInput = parentInputs.length > 0 ? parentInputs.join('\n\n---\n\n') : input;

            // Retrieve memory for this agent type
            const memory = this.memories.get(node.type);
            const memoryContext = memory && memory.entries.length > 0
              ? `\n\nPrevious context from past runs:\n${memory.entries.slice(-3).map((e) => e.content).join('\n---\n')}`
              : '';

            // Mark as running
            const startResult: NodeResult = {
              nodeId,
              status: 'running',
              output: '',
              startedAt: Date.now(),
            };
            execution.results[nodeId] = startResult;
            this.broadcast(executionId, {
              type: 'node_start',
              executionId,
              nodeId,
              timestamp: Date.now(),
            });

            try {
              let output = '';
              const result = await runAgent(
                node.type,
                {
                  input: nodeInput + memoryContext,
                  instructions: node.instructions,
                  name: node.name,
                  onToken: (token) => {
                    output += token;
                    this.broadcast(executionId, {
                      type: 'node_output',
                      executionId,
                      nodeId,
                      output,
                      timestamp: Date.now(),
                    });
                  },
                },
                this.env,
              );

              const doneResult: NodeResult = {
                nodeId,
                status: 'done',
                output: result,
                startedAt: startResult.startedAt,
                finishedAt: Date.now(),
              };
              execution.results[nodeId] = doneResult;
              nodeOutputs[nodeId] = result;

              // Store artifact
              const artifact: Artifact = {
                id: crypto.randomUUID(),
                executionId,
                nodeId,
                nodeName: node.name,
                content: result,
                timestamp: Date.now(),
              };
              if (!this.artifacts.has(executionId)) {
                this.artifacts.set(executionId, []);
              }
              this.artifacts.get(executionId)!.push(artifact);

              // Store memory
              this.addMemory(node.type, result, executionId);

              this.broadcast(executionId, {
                type: 'node_done',
                executionId,
                nodeId,
                output: result,
                timestamp: Date.now(),
              });
            } catch (error: any) {
              const errorResult: NodeResult = {
                nodeId,
                status: 'error',
                output: '',
                error: error.message || 'Unknown error',
                startedAt: startResult.startedAt,
                finishedAt: Date.now(),
              };
              execution.results[nodeId] = errorResult;

              this.broadcast(executionId, {
                type: 'node_error',
                executionId,
                nodeId,
                error: error.message || 'Unknown error',
                timestamp: Date.now(),
              });
            }

            running.delete(nodeId);
            completed.add(nodeId);

            // Add children to queue
            for (const childId of adjacency.get(nodeId) || []) {
              const newDeg = (inDegree.get(childId) || 1) - 1;
              inDegree.set(childId, newDeg);
              if (newDeg === 0) {
                queue.push(childId);
              }
            }
          })
        );

        // Wait for at least one to finish before checking again
        if (running.size > 0) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      execution.status = 'completed';
      execution.finishedAt = Date.now();
      await this.state.storage.put(`ex:${executionId}`, execution);

      this.broadcast(executionId, {
        type: 'workflow_complete',
        executionId,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      execution.status = 'failed';
      execution.finishedAt = Date.now();
      await this.state.storage.put(`ex:${executionId}`, execution);

      this.broadcast(executionId, {
        type: 'workflow_error',
        executionId,
        error: error.message || 'Workflow failed',
        timestamp: Date.now(),
      });
    }
  }

  private addMemory(agentType: string, content: string, executionId: string) {
    const key = agentType as any;
    if (!this.memories.has(key)) {
      this.memories.set(key, { agentType: key, entries: [] });
    }
    const mem = this.memories.get(key)!;
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      content: content.slice(0, 500), // Keep memory concise
      timestamp: Date.now(),
      executionId,
    };
    mem.entries.push(entry);
    // Keep only last 10 entries per agent type
    if (mem.entries.length > 10) {
      mem.entries = mem.entries.slice(-10);
    }
    this.state.storage.put(`mem:${key}`, mem);
  }

  private get env(): any {
    // @ts-ignore
    return (this.state as any).env || {};
  }
}
