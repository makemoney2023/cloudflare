import { useCallback, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Bot,
  Eraser,
  FileEdit,
  LayoutTemplate,
  ListCollapse,
  Megaphone,
  Package,
  PenLine,
  Play,
  Plus,
  Save,
  ScanSearch,
  Search,
  Trash2,
} from 'lucide-react';

import { AgentNode, type AgentNodeData } from '@/components/AgentNode';
import { ArtifactPanel } from '@/components/ArtifactPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Toaster, toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { AGENT_META, TEMPLATES, type AgentType, type Artifact } from '@/lib/agents';

const nodeTypes = { agent: AgentNode };

type FlowNode = Node<AgentNodeData>;

const ADD_ICONS = {
  Search,
  PenLine,
  FileEdit,
  Megaphone,
  ScanSearch,
  ListCollapse,
} as const;

interface WSMessage {
  type: 'node_start' | 'node_output' | 'node_done' | 'node_error' | 'workflow_complete' | 'workflow_error';
  executionId: string;
  nodeId?: string;
  output?: string;
  error?: string;
  timestamp: number;
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState('My Agent Swarm');
  const [inputText, setInputText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const nodeIdCounter = useRef(0);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  const addAgentNode = (agentType: AgentType) => {
    const meta = AGENT_META[agentType];
    const id = `node-${++nodeIdCounter.current}`;
    const newNode: FlowNode = {
      id,
      type: 'agent',
      position: { x: 80 + Math.random() * 380, y: 80 + Math.random() * 280 },
      data: {
        agentType,
        name: meta.name,
        instructions: meta.instructions,
        status: 'idle',
        output: '',
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  };

  const loadTemplate = async (templateId: string) => {
    try {
      const res = await fetch('/api/template?id=' + templateId);
      const tmpl = await res.json();
      if (!tmpl.nodes) {
        toast.error('Template not found');
        return;
      }
      const newNodes: FlowNode[] = tmpl.nodes.map(
        (n: { id: string; type: AgentType; name: string; instructions: string; position: { x: number; y: number } }) => ({
          id: `${n.id}-${++nodeIdCounter.current}`,
          type: 'agent',
          position: n.position,
          data: {
            agentType: n.type,
            name: n.name,
            instructions: n.instructions,
            status: 'idle' as const,
            output: '',
          },
        }),
      );
      const idMap: Record<string, string> = {};
      tmpl.nodes.forEach((n: { id: string }, i: number) => {
        idMap[n.id] = newNodes[i].id;
      });
      const newEdges: Edge[] = tmpl.edges.map(
        (e: { id: string; source: string; target: string }) => ({
          id: `${e.id}-${++nodeIdCounter.current}`,
          source: idMap[e.source],
          target: idMap[e.target],
          animated: true,
        }),
      );
      setNodes(newNodes);
      setEdges(newEdges);
      setSelectedNodeId(null);
      setWorkflowName(tmpl.name);
      setTemplatesOpen(false);
      toast.success(`Loaded "${tmpl.name}"`);
    } catch {
      toast.error('Failed to load template');
    }
  };

  const updateNodeData = (nodeId: string, updates: Partial<AgentNodeData>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
    );
  };

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const buildWorkflowPayload = () => ({
    id: 'wf-' + Date.now(),
    name: workflowName,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.agentType,
      name: n.data.name,
      instructions: n.data.instructions,
      position: n.position,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    createdAt: Date.now(),
  });

  const saveWorkflow = async () => {
    if (nodes.length === 0) {
      toast.error('Add some agent nodes first');
      return;
    }
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWorkflowPayload()),
      });
      if (!res.ok) throw new Error();
      toast.success('Workflow saved');
    } catch {
      toast.error('Failed to save workflow');
    }
  };

  const executeWorkflow = async () => {
    if (nodes.length === 0) {
      toast.error('Add some agent nodes first');
      return;
    }
    if (!inputText.trim()) {
      toast.error('Enter some input for your swarm');
      return;
    }

    setIsExecuting(true);
    setArtifacts([]);
    setShowArtifacts(true);
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle' as const, output: '' } })),
    );

    try {
      const workflow = buildWorkflowPayload();
      const saveRes = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      });
      if (!saveRes.ok) throw new Error('save failed');

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: workflow.id, input: inputText }),
      });
      if (!res.ok) throw new Error('execute failed');
      const { executionId: eid } = await res.json();
      setExecutionId(eid);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws?executionId=${eid}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.nodeId) {
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== msg.nodeId) return n;
              const status =
                msg.type === 'node_done' ? 'done' : msg.type === 'node_error' ? 'error' : 'running';
              return {
                ...n,
                data: {
                  ...n.data,
                  status,
                  output: msg.output !== undefined ? msg.output : n.data.output,
                },
              };
            }),
          );

          if (msg.type === 'node_done' && msg.output) {
            const nodeId = msg.nodeId;
            const output = msg.output;
            const ts = msg.timestamp;
            setNodes((nds) => {
              const node = nds.find((n) => n.id === nodeId);
              if (node) {
                setArtifacts((prev) => [
                  ...prev,
                  {
                    id: `${nodeId}-${Date.now()}`,
                    executionId: eid,
                    nodeId,
                    nodeName: node.data.name,
                    content: output,
                    timestamp: ts,
                  },
                ]);
              }
              return nds;
            });
          }
        }
        if (msg.type === 'workflow_complete') {
          setIsExecuting(false);
          toast.success('Swarm finished');
          ws.close();
          fetch('/api/artifacts?executionId=' + eid)
            .then((r) => r.json())
            .then((arts) => setArtifacts(arts))
            .catch(() => {});
        } else if (msg.type === 'workflow_error') {
          setIsExecuting(false);
          toast.error(msg.error || 'Workflow failed');
          ws.close();
        }
      };

      ws.onerror = () => {
        setIsExecuting(false);
        toast.error('Lost connection to the swarm');
      };
    } catch {
      setIsExecuting(false);
      toast.error('Failed to start execution');
    }
  };

  const clearCanvas = () => {
    wsRef.current?.close();
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setExecutionId(null);
    setArtifacts([]);
    setShowArtifacts(false);
  };

  const runningCount = nodes.filter((n) => n.data.status === 'running').length;

  return (
    <div className="flex h-full flex-col">
      <header className="z-10 flex items-center gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight">Agent Swarm Orchestrator</div>
            <div className="text-[11px] text-muted-foreground">Build multi-agent workflows visually</div>
          </div>
        </div>
        <Input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="w-48"
        />
        {runningCount > 0 && (
          <Badge variant="running" className="gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {runningCount} running
          </Badge>
        )}
        <div className="flex-1" />
        <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">
              <LayoutTemplate />
              Templates
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Workflow templates</DialogTitle>
              <DialogDescription>
                Start from a proven pipeline, then make it your own.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => loadTemplate(tmpl.id)}
                  className="rounded-lg border bg-muted/40 p-3.5 text-left transition-colors hover:border-primary/60 hover:bg-muted"
                >
                  <div className="text-sm font-semibold">{tmpl.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{tmpl.desc}</div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" onClick={() => setShowArtifacts((v) => !v)}>
          <Package />
          Artifacts
          {artifacts.length > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5">
              {artifacts.length}
            </Badge>
          )}
        </Button>
        <Button variant="ghost" onClick={clearCanvas}>
          <Eraser />
          Clear
        </Button>
        <Button variant="outline" onClick={saveWorkflow}>
          <Save />
          Save
        </Button>
        <Button variant="success" onClick={executeWorkflow} disabled={isExecuting}>
          <Play />
          {isExecuting ? 'Running…' : 'Execute Swarm'}
        </Button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-card p-4">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Swarm input
            </h3>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter the task or topic for your agent swarm…"
              className="h-24 resize-y"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add agents
            </h3>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(AGENT_META) as AgentType[]).map((type) => {
                const meta = AGENT_META[type];
                const Icon = ADD_ICONS[meta.icon as keyof typeof ADD_ICONS];
                return (
                  <Button
                    key={type}
                    variant="ghost"
                    className="justify-start"
                    onClick={() => addAgentNode(type)}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {meta.name}
                    <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                );
              })}
            </div>
          </div>

          {selectedNode && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected agent
                </h3>
                <div className="text-sm font-medium">{selectedNode.data.name}</div>
                <Textarea
                  value={selectedNode.data.instructions}
                  onChange={(e) => updateNodeData(selectedNode.id, { instructions: e.target.value })}
                  className="h-20 resize-y text-xs"
                />
                <Button variant="destructive" size="sm" className="w-full" onClick={deleteSelected}>
                  <Trash2 />
                  Delete agent
                </Button>
              </div>
            </>
          )}

          <div className="mt-auto">
            <Card className="bg-muted/40">
              <CardHeader className="p-3 pb-1.5">
                <CardTitle className="text-xs">How it works</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 text-[11px] leading-relaxed text-muted-foreground">
                Add agents or load a template, connect them by dragging between handles, enter input
                and execute. Watch your swarm work live.
              </CardContent>
            </Card>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            className="bg-background"
          >
            <Background color="hsl(var(--border))" gap={24} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const t = (n.data as AgentNodeData | undefined)?.agentType;
                return (t && AGENT_META[t]?.color) || '#64748b';
              }}
              className="!bg-card"
            />
          </ReactFlow>
        </div>

        {showArtifacts && (
          <ArtifactPanel
            artifacts={artifacts}
            executionId={executionId}
            onClose={() => setShowArtifacts(false)}
          />
        )}
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
