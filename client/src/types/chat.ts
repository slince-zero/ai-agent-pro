import type { LucideIcon } from "lucide-react";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type ServerEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

export type PromptPreset = {
  label: string;
  prompt: string;
  icon: LucideIcon;
};
