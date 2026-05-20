import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { githubRepoTool } from "./github.js";
import type { AppTool } from "./types.js";

const tools: AppTool<never>[] = [githubRepoTool as AppTool<never>];

export const toolDispatch: Record<string, AppTool<never>> = Object.fromEntries(
  tools.map((tool) => [tool.name, tool]),
);

export function getOpenAITools(): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    },
  }));
}
