import type { CSSProperties } from 'react'
import { AttachIcon, ConnectorArt, SendIcon, SparkIcon } from '../icons'
import { Reveal } from './Reveal'
import { Eyebrow, ghostButton, iconChip, primaryButton, sectionShell } from './ui'

export const REPO_URL = 'https://github.com/slince-zero/ai-agent-pro'

/**
 * 首屏输入框：App 里那个 composer 的静态复刻。
 * 不接任何请求，点击直接进入 /app，避免 landing 引入对话逻辑与 Markdown 依赖。
 */
function ComposerPreview() {
  return (
    <a
      className="group block max-w-[720px] mx-auto overflow-hidden rounded-[26px] border border-[#b9b8b3] bg-white/85 text-left no-underline shadow-[0_16px_44px_rgba(58,50,43,0.12)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#8f8e89] hover:shadow-[0_20px_52px_rgba(58,50,43,0.16)]"
      href="/app"
      aria-label="打开对话界面"
    >
      <p className="m-0 px-5 pt-4 pb-5 text-[16px] leading-6 text-[#96938c]">
        帮我找适合初学者的 Agent context 教程，要有完整示例，最好是 TypeScript
      </p>
      <div className="flex items-center justify-between gap-3 px-2.5 pb-2.5 pl-3.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full text-[#5a5852]">
            <AttachIcon size={20} />
          </span>
          <span className="text-xs text-[#8a8881] max-[520px]:hidden">
            Enter 发送 · Shift + Enter 换行
          </span>
        </span>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-white shadow-[0_4px_10px_rgba(31,31,31,0.18)] transition-colors duration-200 group-hover:bg-[#f05a2a]">
          <SendIcon size={20} strokeWidth={2} />
        </span>
      </div>
    </a>
  )
}

export function Hero() {
  return (
    <section className="landing-glow relative overflow-hidden pt-[150px] pb-[104px] max-[640px]:pt-[104px] max-[640px]:pb-16">
      <ConnectorArt className="pointer-events-none absolute top-[46%] left-1/2 z-0 w-[min(1240px,124vw)] max-w-none -translate-x-1/2 -translate-y-1/2 select-none opacity-60 max-[640px]:top-[38%] max-[640px]:w-[190vw] max-[640px]:opacity-40" />

      <div className={`relative z-10 ${sectionShell} flex flex-col items-center text-center`}>
        <Reveal order={0}>
          <Eyebrow icon={SparkIcon}>不依赖 Agent framework · 从零实现</Eyebrow>
        </Reveal>

        <Reveal order={1} className="mt-7">
          <div
            className={`${iconChip} mx-auto mb-6 size-12 shadow-[0_10px_28px_rgba(77,58,47,0.08)]`}
            style={{ '--ctx-dur': '900ms' } as CSSProperties}
          >
            <SparkIcon size={26} play="once" />
          </div>
          <h1 className="m-0 text-[clamp(38px,5.4vw,66px)] leading-[1.08] font-black tracking-[-1.4px] text-[#1f1f1f] max-[640px]:text-[clamp(32px,9.4vw,42px)] max-[640px]:tracking-[-0.8px]">
            把模糊的需求
            <br />
            变成可验证的检索
          </h1>
        </Reveal>

        <Reveal order={2} className="mt-6">
          <p className="mx-auto m-0 max-w-[620px] text-[17px] leading-7 text-[#5c5a54] max-[640px]:text-[15px]">
            Context 会把「必须满足什么、要排除什么、更偏好什么」拆成结构化条件，
            再围绕来源证据回答：哪些条件已确认，哪些不满足，哪些仍然无法确认。
          </p>
        </Reveal>

        <Reveal order={3} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a className={primaryButton} href="/app">
            开始一次检索
            <SendIcon size={18} strokeWidth={2} />
          </a>
          <a className={ghostButton} href={REPO_URL} target="_blank" rel="noreferrer">
            查看源码
          </a>
        </Reveal>

        <Reveal order={4} className="mt-14 w-full">
          <ComposerPreview />
        </Reveal>
      </div>
    </section>
  )
}
