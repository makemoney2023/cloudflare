import { WorkflowDO } from './do/WorkflowDO';

export { WorkflowDO };

export interface Env {
  AI: any;
  WORKFLOW_DO: DurableObjectNamespace;
  ARTIFACTS: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve static files
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(getHTML(), {
        headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/styles.css') {
      return new Response(CSS, {
        headers: { 'Content-Type': 'text/css', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // Durable Object routing
    if (url.pathname.startsWith('/api/')) {
      const id = env.WORKFLOW_DO.idFromName('orchestrator');
      const stub = env.WORKFLOW_DO.get(id);
      const doUrl = new URL(request.url);
      doUrl.pathname = doUrl.pathname.replace('/api', '');
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    return new Response('Not found', { status: 404 });
  },
};

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Swarm Orchestrator</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/reactflow@11/dist/umd/index.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reactflow@11/dist/style.css">
</head>
<body>
  <div id="root"></div>
  <div id="boot-error" style="display:none;position:fixed;left:16px;right:16px;bottom:16px;background:#7f1d1d;color:#fff;padding:12px 16px;border-radius:8px;font-size:13px;z-index:1000;"></div>
  <script>
    window.addEventListener('error', function (e) {
      var err = document.getElementById('boot-error');
      var root = document.getElementById('root');
      if (err && root && !root.hasChildNodes()) {
        err.style.display = 'block';
        err.textContent = 'UI failed to start: ' + (e.message || 'unknown error');
      }
    }, true);
  </script>
  <script type="text/babel" data-presets="react">
${APP_JS}
  </script>
</body>
</html>`;
}

const CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; overflow: hidden; }
#root { width: 100vw; height: 100vh; }
.react-flow__attribution { display: none; }
.react-flow__controls { bottom: 20px; left: 20px; }
.react-flow__controls button { background: #1e293b; border: 1px solid #334155; color: #e2e8f0; }
.react-flow__controls button:hover { background: #334155; }
.react-flow__minimap { background: #1e293b; }
.react-flow__node { border-radius: 12px; }
.react-flow__handle { width: 10px; height: 10px; }
.react-flow__handle-left { left: -5px; }
.react-flow__handle-right { right: -5px; }
.react-flow__edge-path { stroke: #475569; stroke-width: 2; }
.react-flow__edge.selected .react-flow__edge-path { stroke: #3b82f6; }
.react-flow__connection-path { stroke: #3b82f6; stroke-width: 2; stroke-dasharray: 5 5; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.pulse { animation: pulse 1.5s ease-in-out infinite; }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.slide-in { animation: slideIn 0.3s ease-out; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #1e293b; }
::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #64748b; }`;

const APP_JS = `
const { useState, useEffect, useCallback, useRef } = React;
const RF = window.ReactFlow;
const { ReactFlow: ReactFlowCanvas, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, Handle, Position } = RF;

const AGENT_TYPES = {
  researcher: { name: 'Researcher', color: '#3B82F6', icon: '\\uD83D\\uDD0D' },
  writer: { name: 'Writer', color: '#8B5CF6', icon: '\\u270D\\uFE0F' },
  editor: { name: 'Editor', color: '#F59E0B', icon: '\\uD83D\\uDCDD' },
  publisher: { name: 'Publisher', color: '#10B981', icon: '\\uD83D\\uDCE2' },
  critic: { name: 'Critic', color: '#EF4444', icon: '\\uD83D\\uDD0E' },
  summarizer: { name: 'Summarizer', color: '#06B6D4', icon: '\\uD83D\\uDCCB' },
};

const DEFAULT_INSTRUCTIONS = {
  researcher: 'Research the given topic thoroughly. Provide key facts, data points, and context.',
  writer: 'Write clear, engaging content based on the input. Adapt tone and style to the target audience.',
  editor: 'Review and improve the content. Fix grammar, improve clarity, and ensure consistency.',
  publisher: 'Format the final content for publication. Add structure, headings, and final touches.',
  critic: 'Critically analyze the content. Identify weaknesses, gaps, and areas for improvement.',
  summarizer: 'Summarize the key points concisely. Capture the essential information.',
};

const TEMPLATES = [
  { id: 'blog-post', name: '\\uD83D\\uDCDC Blog Post Generator', desc: 'Research \\u2192 Write \\u2192 Edit \\u2192 Publish' },
  { id: 'research-report', name: '\\uD83D\\uDCCA Research Report', desc: 'Research \\u2192 Summarize \\u2192 Write \\u2192 Edit' },
  { id: 'content-critique', name: '\\uD83D\\uDD0E Content Critique', desc: 'Write \\u2192 Critique \\u2192 Edit \\u2192 Publish' },
  { id: 'parallel-research', name: '\\uD83D\\uDD16 Parallel Research', desc: '3 Researchers \\u2192 Merge \\u2192 Write' },
];

function AgentNode({ data, selected }) {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('idle');
  const [isExpanded, setIsExpanded] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);

  useEffect(() => {
    if (data.status) setStatus(data.status);
    if (data.output !== undefined) setOutput(data.output);
  }, [data.status, data.output]);

  useEffect(() => {
    fetch('/api/memory?agentType=' + data.agentType)
      .then(r => r.json())
      .then(mem => setMemoryCount(mem.entries ? mem.entries.length : 0))
      .catch(() => {});
  }, [data.agentType, status]);

  const typeInfo = AGENT_TYPES[data.agentType] || AGENT_TYPES.researcher;
  const statusColors = { idle: '#64748b', running: '#3b82f6', done: '#10b981', error: '#ef4444' };

  return (
    <div style={{
      background: '#1e293b',
      border: selected ? '2px solid #3b82f6' : '1px solid #334155',
      borderRadius: 12,
      padding: 0,
      minWidth: 220,
      maxWidth: 320,
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      overflow: 'hidden',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#475569' }} />
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: typeInfo.color + '15',
      }}>
        <span style={{ fontSize: 20 }}>{typeInfo.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{data.name}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{typeInfo.name}</span>
            {memoryCount > 0 && (
              <span style={{ background: '#334155', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>
                \\uD83E\\uDDE0 {memoryCount}
              </span>
            )}
          </div>
        </div>
        <div className={status === 'running' ? 'pulse' : ''} style={{
          width: 10, height: 10, borderRadius: '50%',
          background: statusColors[status],
          boxShadow: status === 'running' ? '0 0 8px ' + statusColors[status] : 'none',
        }} />
      </div>
      <div style={{ padding: '10px 16px' }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Instructions</div>
        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.4 }}>{data.instructions}</div>
      </div>
      {output && (
        <div style={{ borderTop: '1px solid #334155' }}>
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ padding: '8px 16px', fontSize: 11, color: '#94a3b8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Output ({output.length} chars)</span>
            <span>{isExpanded ? '\\u25B2' : '\\u25BC'}</span>
          </div>
          {isExpanded && (
            <div style={{
              padding: '0 16px 12px',
              fontSize: 12,
              color: '#cbd5e1',
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
            }}>
              {output}
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#475569' }} />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

function ArtifactPanel({ artifacts, onClose }) {
  const [expandedId, setExpandedId] = useState(null);

  if (artifacts.length === 0) {
    return (
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 360,
        background: '#1e293b', borderLeft: '1px solid #334155',
        display: 'flex', flexDirection: 'column', zIndex: 20,
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>\\uD83D\\uDCE6 Artifacts</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>\\u2715</button>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>\\uD83D\\uDCE6</div>
          <div>No artifacts yet. Run a workflow to see outputs.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="slide-in" style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 360,
      background: '#1e293b', borderLeft: '1px solid #334155',
      display: 'flex', flexDirection: 'column', zIndex: 20,
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>\\uD83D\\uDCE6 Artifacts ({artifacts.length})</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>\\u2715</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {artifacts.map((art) => (
          <div key={art.id} style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
            padding: 12, marginBottom: 10, cursor: 'pointer',
          }}
            onClick={() => setExpandedId(expandedId === art.id ? null : art.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{art.nodeName}</span>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {new Date(art.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div style={{
              fontSize: 12, color: '#94a3b8', lineHeight: 1.4,
              maxHeight: expandedId === art.id ? 300 : 60,
              overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>
              {art.content}
            </div>
            {expandedId === art.id && (
              <button
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(art.content); }}
                style={{ marginTop: 8, background: '#334155', border: 'none', borderRadius: 4, padding: '4px 10px', color: '#e2e8f0', fontSize: 11, cursor: 'pointer' }}
              >
                Copy to clipboard
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState('My Agent Swarm');
  const [inputText, setInputText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [artifacts, setArtifacts] = useState([]);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [parallelGroups, setParallelGroups] = useState([]);
  const wsRef = useRef(null);
  const nodeIdCounter = useRef(0);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, [setEdges]);

  const addAgentNode = (agentType) => {
    const typeInfo = AGENT_TYPES[agentType];
    const id = 'node-' + (++nodeIdCounter.current);
    const newNode = {
      id,
      type: 'agent',
      position: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 },
      data: {
        agentType,
        name: typeInfo.name,
        instructions: DEFAULT_INSTRUCTIONS[agentType],
        status: 'idle',
        output: '',
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const loadTemplate = (templateId) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    // Fetch full template from server
    fetch('/api/template?id=' + templateId)
      .then((r) => r.json())
      .then((tmpl) => {
        if (tmpl.nodes) {
          const newNodes = tmpl.nodes.map((n) => ({
            id: n.id + '-' + (++nodeIdCounter.current),
            type: 'agent',
            position: n.position,
            data: {
              agentType: n.type,
              name: n.name,
              instructions: n.instructions,
              status: 'idle',
              output: '',
            },
          }));
          const idMap = {};
          tmpl.nodes.forEach((n, i) => { idMap[n.id] = newNodes[i].id; });
          const newEdges = tmpl.edges.map((e) => ({
            ...e,
            id: e.id + '-' + (++nodeIdCounter.current),
            source: idMap[e.source],
            target: idMap[e.target],
            animated: true,
          }));
          setNodes(newNodes);
          setEdges(newEdges);
          setWorkflowName(tmpl.name);
          setShowTemplates(false);
        }
      });
  };

  const updateNodeData = (nodeId, updates) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n))
    );
    setSelectedNode((prev) =>
      prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...updates } } : prev
    );
  };

  const deleteSelected = () => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
    }
  };

  const saveWorkflow = async () => {
    const workflow = {
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
    };
    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });
    alert('Workflow saved!');
  };

  const executeWorkflow = async () => {
    if (nodes.length === 0) {
      alert('Add some agent nodes first!');
      return;
    }
    if (!inputText.trim()) {
      alert('Enter some input for your swarm!');
      return;
    }

    setIsExecuting(true);
    setArtifacts([]);
    setShowArtifacts(true);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle', output: '' } })));

    const workflow = {
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
    };

    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });

    const res = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: workflow.id, input: inputText }),
    });
    const { executionId: eid } = await res.json();
    setExecutionId(eid);

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + window.location.host + '/api/ws?executionId=' + eid);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.nodeId) {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === msg.nodeId) {
              const updates = { status: msg.type === 'node_done' ? 'done' : msg.type === 'node_error' ? 'error' : 'running' };
              if (msg.output !== undefined) updates.output = msg.output;
              if (msg.error) updates.error = msg.error;
              return { ...n, data: { ...n.data, ...updates } };
            }
            return n;
          })
        );

        // Track artifacts
        if (msg.type === 'node_done' && msg.output) {
          const node = nodes.find((n) => n.id === msg.nodeId);
          if (node) {
            setArtifacts((prev) => [...prev, {
              id: msg.nodeId + '-' + Date.now(),
              executionId: eid,
              nodeId: msg.nodeId,
              nodeName: node.data.name,
              content: msg.output,
              timestamp: msg.timestamp,
            }]);
          }
        }

        // Track parallel execution
        if (msg.type === 'node_start') {
          setParallelGroups((prev) => {
            const running = nodes.filter((n) => {
              const nodeMsg = msg.nodeId === n.id;
              return nodeMsg || (prev.find((g) => g.includes(n.id)));
            });
            const existing = prev.find((g) => g.includes(msg.nodeId));
            if (existing) return prev;
            return [...prev, running.map((n) => n.id)];
          });
        }
      }
      if (msg.type === 'workflow_complete' || msg.type === 'workflow_error') {
        setIsExecuting(false);
        ws.close();
        // Fetch final artifacts
        fetch('/api/artifacts?executionId=' + eid)
          .then((r) => r.json())
          .then((arts) => setArtifacts(arts))
          .catch(() => {});
      }
    };
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setArtifacts([]);
    setShowArtifacts(false);
  };

  const runningCount = nodes.filter((n) => n.data.status === 'running').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '12px 24px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>\\uD83D\\uDC1D</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Agent Swarm Orchestrator</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Build multi-agent workflows visually</div>
          </div>
        </div>
        <input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
            padding: '6px 12px', color: '#e2e8f0', fontSize: 13, width: 200,
          }}
        />
        {runningCount > 0 && (
          <span style={{ background: '#3b82f6', padding: '4px 10px', borderRadius: 12, fontSize: 12 }}>
            {runningCount} running
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowTemplates(!showTemplates)} style={btnStyle('#8B5CF6')}>
          \\uD83D\\uDCCB Templates
        </button>
        <button onClick={clearCanvas} style={btnStyle('#475569')}>Clear</button>
        <button onClick={saveWorkflow} style={btnStyle('#3b82f6')}>Save</button>
        <button
          onClick={executeWorkflow}
          disabled={isExecuting}
          style={{ ...btnStyle(isExecuting ? '#475569' : '#10B981'), opacity: isExecuting ? 0.6 : 1 }}
        >
          {isExecuting ? 'Running...' : '\\u26A1 Execute Swarm'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        {/* Sidebar */}
        <div style={{
          width: 260, background: '#1e293b', borderRight: '1px solid #334155',
          padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto',
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Swarm Input</div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter the task or topic for your agent swarm..."
              style={{
                width: '100%', height: 100, background: '#0f172a', border: '1px solid #334155',
                borderRadius: 8, padding: 10, color: '#e2e8f0', fontSize: 13, resize: 'vertical',
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Add Agents</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(AGENT_TYPES).map(([type, info]) => (
                <button
                  key={type}
                  onClick={() => addAgentNode(type)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
                    color: '#e2e8f0', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  }}
                >
                  <span>{info.icon}</span>
                  <span>{info.name}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedNode && (
            <div style={{ borderTop: '1px solid #334155', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Selected Agent</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{selectedNode.data.name}</div>
              <textarea
                value={selectedNode.data.instructions}
                onChange={(e) => updateNodeData(selectedNode.id, { instructions: e.target.value })}
                style={{
                  width: '100%', height: 80, background: '#0f172a', border: '1px solid #334155',
                  borderRadius: 8, padding: 8, color: '#e2e8f0', fontSize: 12, resize: 'vertical',
                }}
              />
              <button onClick={deleteSelected} style={{ ...btnStyle('#ef4444'), marginTop: 8, width: '100%' }}>
                Delete Agent
              </button>
            </div>
          )}

          <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 'auto' }}>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
              <strong style={{ color: '#94a3b8' }}>How to use:</strong><br />
              1. Add agents or load a template<br />
              2. Connect them by dragging between handles<br />
              3. Enter input and click Execute<br />
              4. Watch your swarm work live!
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1 }}>
          <ReactFlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(e, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
          >
            <Background color="#334155" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(n) => AGENT_TYPES[n.data?.agentType]?.color || '#64748b'}
              style={{ background: '#1e293b' }}
            />
          </ReactFlowCanvas>
        </div>

        {/* Templates Modal */}
        {showTemplates && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
            onClick={() => setShowTemplates(false)}
          >
            <div style={{
              background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
              padding: 24, maxWidth: 500, width: '90%',
            }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>\\uD83D\\uDCCB Workflow Templates</span>
                <button onClick={() => setShowTemplates(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}>\\u2715</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    onClick={() => loadTemplate(tmpl.id)}
                    style={{
                      background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
                      padding: 16, cursor: 'pointer', transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#334155'}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{tmpl.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{tmpl.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Artifact Panel */}
        {showArtifacts && <ArtifactPanel artifacts={artifacts} onClose={() => setShowArtifacts(false)} />}
      </div>
    </div>
  );
}

function btnStyle(bg) {
  return {
    background: bg, border: 'none', borderRadius: 8, padding: '8px 16px',
    color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
`;
