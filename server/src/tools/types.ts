export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: readonly string[];
  additionalProperties?: boolean;
};

export type AppTool<Args = Record<string, unknown>> = {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (args: Args) => Promise<string>;
};
