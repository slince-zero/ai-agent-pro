import { githubRepoTool } from "./github.js";
import type { AppTool } from "./types.js";

const tools: AppTool[] = [githubRepoTool];

export function findToolForInput(input: string) {
  return tools.find((tool) => tool.canHandle(input)) ?? null;
}
