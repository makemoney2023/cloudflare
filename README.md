# Agent Swarm Orchestrator

A visual multi-agent workflow builder for Cloudflare Workers. Drag-and-drop agents onto a canvas, connect them into pipelines, and watch them execute live with token-by-token streaming.

## Features

- **Visual Canvas** — Drag-and-drop agent nodes with React Flow
- **6 Agent Types** — Researcher, Writer, Editor, Publisher, Critic, Summarizer
- **Parallel Execution** — Branches run concurrently with topological scheduling
- **Live Streaming** — WebSocket-powered token-by-token output
- **Agent Memory** — Agents remember context across executions
- **Artifact Viewer** — Side panel showing all node outputs
- **Template Workflows** — Pre-built pipelines (Blog Post, Research Report, Content Critique, Parallel Research)
- **Cloudflare Native** — Workers AI, Durable Objects, WebSockets, R2

## Quick Start

```bash
npm install
npx wrangler dev
```

Open http://localhost:8787

## Deploy

```bash
npx wrangler deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full guide.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Flow 11 |
| Backend | Cloudflare Workers |
| State | Durable Objects |
| AI | Workers AI (Llama 3.1 8B) |
| Realtime | WebSockets |
| Storage | R2 |

## Project Structure

```
agent-swarm-orchestrator/
├── src/
│   ├── index.ts          # Worker entry + embedded frontend
│   ├── types.ts          # Shared types + templates
│   ├── ai/
│   │   └── agents.ts     # Workers AI integration
│   └── do/
│       └── WorkflowDO.ts # Durable Object (state + execution)
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## License

MIT
