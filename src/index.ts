import { WorkflowDO } from './do/WorkflowDO';

export { WorkflowDO };

export interface Env {
  AI: any;
  WORKFLOW_DO: DurableObjectNamespace;
  ARTIFACTS: R2Bucket;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Durable Object routing for the API (live execution, state, memory, artifacts)
    if (url.pathname.startsWith('/api/')) {
      const id = env.WORKFLOW_DO.idFromName('orchestrator');
      const stub = env.WORKFLOW_DO.get(id);
      const doUrl = new URL(request.url);
      doUrl.pathname = doUrl.pathname.replace('/api', '');
      return stub.fetch(new Request(doUrl.toString(), request));
    }

    // Static frontend (Vite + shadcn build output in frontend/dist)
    return env.ASSETS.fetch(request);
  },
};
