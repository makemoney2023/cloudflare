export type AgentType = 'researcher' | 'writer' | 'editor' | 'publisher' | 'critic' | 'summarizer';

export interface AgentNode {
  id: string;
  type: AgentType;
  name: string;
  instructions: string;
  position: { x: number; y: number };
}

export interface AgentEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
  createdAt: number;
}

export type NodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  results: Record<string, NodeResult>;
  startedAt: number;
  finishedAt?: number;
}

export interface WSMessage {
  type: 'node_start' | 'node_output' | 'node_done' | 'node_error' | 'workflow_complete' | 'workflow_error';
  executionId: string;
  nodeId?: string;
  output?: string;
  error?: string;
  timestamp: number;
}

export interface AgentMemory {
  agentType: AgentType;
  entries: MemoryEntry[];
}

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: number;
  executionId: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: AgentNode[];
  edges: AgentEdge[];
}

export interface Artifact {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  content: string;
  timestamp: number;
}

export const AGENT_DEFAULTS: Record<AgentType, { name: string; instructions: string; color: string }> = {
  researcher: {
    name: 'Researcher',
    instructions: 'Research the given topic thoroughly. Provide key facts, data points, and context. Be comprehensive but concise.',
    color: '#3B82F6',
  },
  writer: {
    name: 'Writer',
    instructions: 'Write clear, engaging content based on the input. Adapt tone and style to the target audience.',
    color: '#8B5CF6',
  },
  editor: {
    name: 'Editor',
    instructions: 'Review and improve the content. Fix grammar, improve clarity, and ensure consistency. Return the polished version.',
    color: '#F59E0B',
  },
  publisher: {
    name: 'Publisher',
    instructions: 'Format the final content for publication. Add structure, headings, and any final touches.',
    color: '#10B981',
  },
  critic: {
    name: 'Critic',
    instructions: 'Critically analyze the content. Identify weaknesses, gaps, and areas for improvement. Be constructive but thorough.',
    color: '#EF4444',
  },
  summarizer: {
    name: 'Summarizer',
    instructions: 'Summarize the key points concisely. Capture the essential information without losing important details.',
    color: '#06B6D4',
  },
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'blog-post',
    name: 'Blog Post Generator',
    description: 'Research → Write → Edit → Publish a complete blog post',
    nodes: [
      { id: 't1-researcher', type: 'researcher', name: 'Researcher', instructions: DEFAULT_INSTRUCTIONS.researcher, position: { x: 50, y: 100 } },
      { id: 't1-writer', type: 'writer', name: 'Writer', instructions: DEFAULT_INSTRUCTIONS.writer, position: { x: 350, y: 100 } },
      { id: 't1-editor', type: 'editor', name: 'Editor', instructions: DEFAULT_INSTRUCTIONS.editor, position: { x: 650, y: 100 } },
      { id: 't1-publisher', type: 'publisher', name: 'Publisher', instructions: DEFAULT_INSTRUCTIONS.publisher, position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't1-e1', source: 't1-researcher', target: 't1-writer' },
      { id: 't1-e2', source: 't1-writer', target: 't1-editor' },
      { id: 't1-e3', source: 't1-editor', target: 't1-publisher' },
    ],
  },
  {
    id: 'research-report',
    name: 'Research Report',
    description: 'Research → Summarize → Write → Edit a detailed report',
    nodes: [
      { id: 't2-researcher', type: 'researcher', name: 'Researcher', instructions: DEFAULT_INSTRUCTIONS.researcher, position: { x: 50, y: 100 } },
      { id: 't2-summarizer', type: 'summarizer', name: 'Summarizer', instructions: DEFAULT_INSTRUCTIONS.summarizer, position: { x: 350, y: 100 } },
      { id: 't2-writer', type: 'writer', name: 'Report Writer', instructions: 'Write a detailed, well-structured report based on the research summary.', position: { x: 650, y: 100 } },
      { id: 't2-editor', type: 'editor', name: 'Editor', instructions: DEFAULT_INSTRUCTIONS.editor, position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't2-e1', source: 't2-researcher', target: 't2-summarizer' },
      { id: 't2-e2', source: 't2-summarizer', target: 't2-writer' },
      { id: 't2-e3', source: 't2-writer', target: 't2-editor' },
    ],
  },
  {
    id: 'content-critique',
    name: 'Content Critique & Improve',
    description: 'Write → Critique → Edit → Publish with quality assurance',
    nodes: [
      { id: 't3-writer', type: 'writer', name: 'Writer', instructions: DEFAULT_INSTRUCTIONS.writer, position: { x: 50, y: 100 } },
      { id: 't3-critic', type: 'critic', name: 'Critic', instructions: DEFAULT_INSTRUCTIONS.critic, position: { x: 350, y: 100 } },
      { id: 't3-editor', type: 'editor', name: 'Editor', instructions: 'Address all the critic\'s feedback and produce a final polished version.', position: { x: 650, y: 100 } },
      { id: 't3-publisher', type: 'publisher', name: 'Publisher', instructions: DEFAULT_INSTRUCTIONS.publisher, position: { x: 950, y: 100 } },
    ],
    edges: [
      { id: 't3-e1', source: 't3-writer', target: 't3-critic' },
      { id: 't3-e2', source: 't3-critic', target: 't3-editor' },
      { id: 't3-e3', source: 't3-editor', target: 't3-publisher' },
    ],
  },
  {
    id: 'parallel-research',
    name: 'Parallel Research Merge',
    description: 'Multiple researchers work in parallel, then merge results',
    nodes: [
      { id: 't4-r1', type: 'researcher', name: 'Tech Researcher', instructions: 'Research the technical aspects, architecture, and implementation details.', position: { x: 50, y: 50 } },
      { id: 't4-r2', type: 'researcher', name: 'Market Researcher', instructions: 'Research the market landscape, competitors, and business implications.', position: { x: 50, y: 200 } },
      { id: 't4-r3', type: 'researcher', name: 'User Researcher', instructions: 'Research user needs, pain points, and UX considerations.', position: { x: 50, y: 350 } },
      { id: 't4-summarizer', type: 'summarizer', name: 'Merge & Summarize', instructions: 'Combine all research into a unified summary. Identify overlaps and unique insights.', position: { x: 400, y: 200 } },
      { id: 't4-writer', type: 'writer', name: 'Writer', instructions: 'Write a comprehensive report based on the merged research.', position: { x: 700, y: 200 } },
    ],
    edges: [
      { id: 't4-e1', source: 't4-r1', target: 't4-summarizer' },
      { id: 't4-e2', source: 't4-r2', target: 't4-summarizer' },
      { id: 't4-e3', source: 't4-r3', target: 't4-summarizer' },
      { id: 't4-e4', source: 't4-summarizer', target: 't4-writer' },
    ],
  },
];

const DEFAULT_INSTRUCTIONS: Record<AgentType, string> = {
  researcher: 'Research the given topic thoroughly. Provide key facts, data points, and context. Be comprehensive but concise.',
  writer: 'Write clear, engaging content based on the input. Adapt tone and style to the target audience.',
  editor: 'Review and improve the content. Fix grammar, improve clarity, and ensure consistency. Return the polished version.',
  publisher: 'Format the final content for publication. Add structure, headings, and any final touches.',
  critic: 'Critically analyze the content. Identify weaknesses, gaps, and areas for improvement. Be constructive but thorough.',
  summarizer: 'Summarize the key points concisely. Capture the essential information without losing important details.',
};
