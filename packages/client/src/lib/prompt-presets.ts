import { Code2, GitBranch, Search, Sparkles, Wrench } from 'lucide-react'

import type { PromptPreset } from '@/types/chat'

export const promptPresets: PromptPreset[] = [
  {
    label: '研究 GitHub 仓库',
    prompt:
      '分析这个 GitHub 仓库的定位、技术栈、活跃度和适合学习的切入点：https://github.com/facebook/react',
    icon: GitBranch,
  },
  {
    label: '理解项目结构',
    prompt: '我会提供项目目录和关键文件，请帮我解释模块职责、数据流和优先阅读顺序。',
    icon: Code2,
  },
  {
    label: '排查报错日志',
    prompt: '我会贴一段报错日志，请帮我定位可能原因、排查步骤和最小修复方案。',
    icon: Search,
  },
  {
    label: '优化用户体验',
    prompt: '我会描述一个页面或交互流程，请帮我从信息层级、状态反馈、可访问性和边界状态上优化。',
    icon: Wrench,
  },
  {
    label: '制定重构方案',
    prompt: '我会提供一段代码或模块现状，请帮我制定分阶段、低风险、可验证的重构方案。',
    icon: Sparkles,
  },
]
