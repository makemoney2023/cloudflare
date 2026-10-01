import type { AgentType } from '../types';

interface AgentRunOptions {
  input: string;
  instructions: string;
  name: string;
  onToken?: (token: string) => void;
}

export async function runAgent(type: AgentType, options: AgentRunOptions, env: any): Promise<string> {
  const { input, instructions, name, onToken } = options;

  const systemPrompt = buildSystemPrompt(type, name, instructions);
  const userPrompt = buildUserPrompt(type, input);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  if (!env || !env.AI) {
    throw new Error('Workers AI binding is not available.');
  }

  try {
    const stream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      stream: true,
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullOutput = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.response;
          if (token) {
            fullOutput += token;
            onToken?.(token);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    const streamed = fullOutput.trim();
    if (streamed) {
      return streamed.slice(0, 8000);
    }
  } catch (error) {
    // Fall through to non-streaming below.
  }

  // Fallback: non-streaming
  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages,
  });
  const output = (response as any).response?.trim();
  if (!output) {
    throw new Error('Agent failed to produce output.');
  }
  return output.slice(0, 8000);
}

function buildSystemPrompt(type: AgentType, name: string, instructions: string): string {
  const roleMap: Record<AgentType, string> = {
    researcher: 'an expert researcher who gathers and synthesizes information',
    writer: 'a skilled writer who creates clear, engaging content',
    editor: 'a meticulous editor who polishes and improves content',
    publisher: 'a publication specialist who formats content for its final audience',
    critic: 'a constructive critic who identifies weaknesses and opportunities',
    summarizer: 'a concise summarizer who distills complex information',
  };

  return `You are ${name}, ${roleMap[type]}. ${instructions}

Rules:
- Stay focused on your specific role
- Build on the input you receive
- Be concise but thorough
- Return only your final output, no meta-commentary`;
}

function buildUserPrompt(type: AgentType, input: string): string {
  const actionMap: Record<AgentType, string> = {
    researcher: 'Research the following topic and provide comprehensive findings:',
    writer: 'Write content based on the following input:',
    editor: 'Review and improve the following content:',
    publisher: 'Format the following content for publication:',
    critic: 'Critically analyze the following content:',
    summarizer: 'Summarize the following content:',
  };

  return `${actionMap[type]}\n\n${input}`;
}
