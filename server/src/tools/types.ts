export type ToolContext = {
  input: string;
};

export type ToolResponse = {
  html: string;
};

export type AppTool = {
  name: string;
  description: string;
  canHandle: (input: string) => boolean;
  run: (context: ToolContext) => Promise<ToolResponse>;
};
