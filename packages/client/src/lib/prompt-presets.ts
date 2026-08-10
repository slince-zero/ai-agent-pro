import { Boxes, Code2, Route, Search } from 'lucide-react'

import type { PromptPreset } from '@/types/chat'

export const promptPresets: PromptPreset[] = [
  {
    label: '项目概览',
    prompt: '这个项目解决什么问题？请结合 README、依赖和入口文件说明技术栈与核心模块。',
    icon: Boxes,
  },
  {
    label: '阅读路线',
    prompt: '如果我要系统学习这个项目，应该按什么顺序阅读哪些文件？请说明每一步的目标。',
    icon: Code2,
  },
  {
    label: '请求调用链',
    prompt: '请找到应用入口，并跟踪一次典型请求从接收、业务逻辑到数据存储的调用链。',
    icon: Route,
  },
  {
    label: '实现定位',
    prompt: '请评估这个项目中最值得深入理解的三个实现点，并引用相关源码文件。',
    icon: Search,
  },
]
