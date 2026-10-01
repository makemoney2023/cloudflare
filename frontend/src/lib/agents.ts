export type AgentType =
  | 'researcher'
  | 'writer'
  | 'editor'
  | 'publisher'
  | 'critic'
  | 'summarizer';

export type NodeStatus = 'idle' | 'running' | 'done' | 'error';

export interface Artifact {
  id: string;
  executionId: string;
  nodeId: string;
  nodeName: string;
  content: string;
  timestamp: number;
}

export interface TemplateMeta {
  id: string;
  name: string;
  desc: string;
}

export const AGENT_META: Record<
  AgentType,
  { name: string; color: string; icon: string; instructions: string }
> = {
  researcher: {
    name: 'Researcher',
    color: '#3B82F6',
    icon: 'Search',
    instructions:
      'Research the given topic thoroughly. Provide key facts, data points, and context.',
  },
  writer: {
    name: 'Writer',
    color: '#8B5CF6',
    icon: 'PenLine',
    instructions:
      'Write clear, engaging content based on the input. Adapt tone and style to the target audience.',
  },
  editor: {
    name: 'Editor',
    color: '#F59E0B',
    icon: 'FileEdit',
    instructions:
      'Review and improve the content. Fix grammar, improve clarity, and ensure consistency.',
  },
  publisher: {
    name: 'Publisher',
    color: '#10B981',
    icon: 'Megaphone',
    instructions:
      'Format the final content for publication. Add structure, headings, and final touches.',
  },
  critic: {
    name: 'Critic',
    color: '#EF4444',
    icon: 'ScanSearch',
    instructions:
      'Critically analyze the content. Identify weaknesses, gaps, and areas for improvement.',
  },
  summarizer: {
    name: 'Summarizer',
    color: '#06B6D4',
    icon: 'ListCollapse',
    instructions:
      'Summarize the key points concisely. Capture the essential information.',
  },
};

export const TEMPLATES: TemplateMeta[] = [
  { id: 'blog-post', name: 'Blog Post Generator', desc: 'Research → Write → Edit → Publish' },
  { id: 'research-report', name: 'Research Report', desc: 'Research → Summarize → Write → Edit' },
  { id: 'content-critique', name: 'Content Critique', desc: 'Write → Critique → Edit → Publish' },
  { id: 'parallel-research', name: 'Parallel Research', desc: '3 Researchers → Merge → Write' },
];
