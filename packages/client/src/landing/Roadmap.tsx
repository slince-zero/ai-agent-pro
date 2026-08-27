import { ConfirmedIcon, EmptyIcon, EvidenceIcon, ThinkingIcon } from '../icons'
import { REPO_URL } from './Hero'
import { Reveal } from './Reveal'
import { Eyebrow, SectionHeading, iconChip, sectionShell } from './ui'

type Stage = {
  index: string
  title: string
  question: string
  state: 'done' | 'active' | 'planned'
}

/** 与 docs/product-plan.md 的分阶段计划一一对应 */
const stages: Stage[] = [
  {
    index: '00',
    title: '对齐产品契约',
    question: '文档、协作规则与架构决策指向同一个方向',
    state: 'done',
  },
  {
    index: '01',
    title: '单一 DeepSeek 客户端',
    question: '请求、错误、超时和 Token usage 如何流动',
    state: 'done',
  },
  {
    index: '02',
    title: '检索意图与条件更新',
    question: '如何稳定区分硬条件、排除项、软偏好和未知',
    state: 'active',
  },
  {
    index: '03',
    title: '搜索来源与候选标准化',
    question: '哪些字段可靠，哪些必须进一步检查',
    state: 'planned',
  },
  {
    index: '04',
    title: '过滤、证据与重排',
    question: '确定性规则与模型判断如何分工',
    state: 'planned',
  },
  {
    index: '05',
    title: '上下文构建',
    question: '有限预算内，什么信息最值得进入下一次请求',
    state: 'planned',
  },
  {
    index: '06',
    title: '最小检索 Agent loop',
    question: '什么时候继续检索，什么时候停下来回答',
    state: 'planned',
  },
  {
    index: '07',
    title: '多轮细化与日常对话',
    question: '如何在保留条件的同时自然地修改任务',
    state: 'planned',
  },
]

const stateMeta = {
  done: {
    Icon: ConfirmedIcon,
    label: '已完成',
    className: 'text-[#3f7d4f] border-[#3f7d4f]/25 bg-[#f1f6f1]',
  },
  active: {
    Icon: ThinkingIcon,
    label: '进行中',
    className: 'text-[#d4491f] border-[#f05a2a]/30 bg-[#fff7f2]',
  },
  planned: {
    Icon: EmptyIcon,
    label: '计划中',
    className: 'text-[#8a8881] border-[#e0ded7] bg-[#faf9f5]',
  },
} as const

const stack = [
  { label: '前端', value: 'React 19 · Vite 8 · Tailwind CSS 4' },
  { label: '服务端', value: 'Express 5 · NDJSON 流式响应' },
  { label: '模型', value: 'DeepSeek · 手写 fetch 客户端' },
  { label: '约束', value: '不引入任何 Agent framework' },
]

export function Roadmap() {
  return (
    <section className={`landing-defer ${sectionShell} py-[104px] max-[640px]:py-16`}>
      <SectionHeading
        eyebrow={<Eyebrow icon={EvidenceIcon}>项目阶段</Eyebrow>}
        title="按学习问题推进，而不是按功能堆叠"
        description="每个阶段先回答一个具体的工程问题，再进入下一步；核心链路由项目所有者先写第一版。"
      />

      <ol className="mt-14 grid list-none grid-cols-2 gap-4 p-0 max-[820px]:grid-cols-1">
        {stages.map(({ index, title, question, state }, order) => {
          const meta = stateMeta[state]

          return (
            <Reveal as="li" order={order % 2} key={index}>
              <div className="ctx-trigger flex h-full items-start gap-4 rounded-2xl border border-[#e3e1db] bg-white/70 px-5 py-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[#f05a2a]/30">
                <span className={`${iconChip} size-9 shrink-0`}>
                  <meta.Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#a8a59e]">{index}</span>
                    <span className="text-[15px] font-bold text-[#1f1f1f]">{title}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-6 text-[#77746d]">
                    {question}
                  </span>
                </span>
              </div>
            </Reveal>
          )
        })}
      </ol>

      <Reveal className="mt-16 grid grid-cols-4 gap-5 rounded-3xl border border-[#e3e1db] bg-white/60 px-7 py-7 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1">
        {stack.map(({ label, value }) => (
          <div key={label}>
            <p className="m-0 text-xs font-semibold tracking-[0.02em] text-[#a8a59e]">{label}</p>
            <p className="mt-1.5 mb-0 text-[14px] leading-6 font-medium text-[#34332f]">{value}</p>
          </div>
        ))}
      </Reveal>

      <Reveal className="mt-6 text-center text-[13px] leading-6 text-[#8a8881]">
        完整的产品假设、边界与阶段拆分见仓库里的{' '}
        <a
          className="font-semibold text-[#d4491f] underline underline-offset-2"
          href={`${REPO_URL}/blob/main/docs/product-plan.md`}
          target="_blank"
          rel="noreferrer"
        >
          docs/product-plan.md
        </a>
        。
      </Reveal>
    </section>
  )
}
