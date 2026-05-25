import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { z } from "zod";
import { githubRepoTool } from "./github.js";
import { webFetchTool } from "./web-fetch.js";
import type { AppTool } from "./types.js";

const tools = [githubRepoTool, webFetchTool];
type RegisteredTool = AppTool<unknown>;

export const toolDispatch = Object.fromEntries(
  tools.map((tool) => [tool.name, tool]),
) as Record<string, RegisteredTool | undefined>;

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

function formatValidationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}

export async function runTool(name: string, args: unknown) {
  const tool = toolDispatch[name];

  if (!tool) {
    return `未知工具：${name}`;
  }

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return JSON.stringify(
      {
        error: "工具参数校验失败",
        tool: name,
        issues: formatValidationIssues(parsed.error),
      },
      null,
      2,
    );
  }

  try {
    return await tool.run(parsed.data);
  } catch (error) {
    console.error(`工具 ${name} 执行失败：`, error);
    return `工具执行出错：${(error as Error).message}`;
  }
}
