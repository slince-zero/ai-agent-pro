import { Code2, GitBranch, Search, Sparkles, Wrench } from "lucide-react";

import type { PromptPreset } from "@/types/chat";

export const promptPresets: PromptPreset[] = [
  {
    label: "读取 GitHub 仓库",
    prompt: "https://github.com/facebook/react",
    icon: GitBranch,
  },
  {
    label: "检查组件结构",
    prompt: "帮我检查 React 组件结构",
    icon: Code2,
  },
  {
    label: "优化交互细节",
    prompt: "优化这个页面的交互细节",
    icon: Wrench,
  },
  {
    label: "分析报错日志",
    prompt: "分析接口报错日志",
    icon: Search,
  },
  {
    label: "制定重构方案",
    prompt: "给我一个重构方案",
    icon: Sparkles,
  },
];
