import { ContextLogo, NewChatIcon, SendIcon } from '../icons'
import { Demo } from './Demo'
import { Hero, REPO_URL } from './Hero'
import { Pipeline } from './Pipeline'
import { Reveal } from './Reveal'
import { ghostButton, primaryButton, sectionShell } from './ui'
import { Roadmap } from './Roadmap'
import './landing.css'

const navLink =
  'rounded-lg px-2 py-1 text-sm font-medium text-[#5c5a54] no-underline transition-colors hover:text-[#d4491f]'

export function Landing() {
  return (
    <div className="min-w-[320px] bg-[#faf9f5] font-sans text-[#1f1f1f] antialiased">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[#1f1f1f] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        href="#how"
      >
        跳到正文
      </a>

      <header className="sticky top-0 z-40 border-b border-[#e6e4dd] bg-[#faf9f5]/85 backdrop-blur-md">
        <div className={`${sectionShell} flex h-16 items-center justify-between gap-4`}>
          <a
            className="ctx-trigger rounded-lg text-[#1f1f1f] no-underline"
            href="/"
            aria-label="Context 首页"
          >
            <ContextLogo size={26} />
          </a>

          <nav className="flex items-center gap-1.5" aria-label="页面导航">
            <a className={`${navLink} max-[640px]:hidden`} href="#how">
              工作方式
            </a>
            <a className={`${navLink} max-[640px]:hidden`} href="#demo">
              界面
            </a>
            <a className={`${navLink} max-[640px]:hidden`} href="#roadmap">
              进度
            </a>
            <a
              className={`${navLink} max-[820px]:hidden`}
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className="ctx-trigger ml-2 inline-flex h-10 items-center gap-2 rounded-full bg-[#1f1f1f] px-4 text-sm font-semibold text-[#faf9f5] no-underline transition-colors duration-200 hover:bg-[#f05a2a]"
              href="/app"
            >
              <NewChatIcon size={17} />
              打开对话
            </a>
          </nav>
        </div>
      </header>

      <main>
        <Hero />
        <div id="how">
          <Pipeline />
        </div>
        <div id="demo">
          <Demo />
        </div>
        <div id="roadmap">
          <Roadmap />
        </div>

        <section className="landing-defer border-t border-[#e6e4dd] bg-[#f4f1ea]/70 py-[104px] max-[640px]:py-16">
          <Reveal className={`${sectionShell} flex flex-col items-center text-center`}>
            <h2 className="m-0 max-w-[680px] text-[clamp(26px,3.4vw,40px)] leading-[1.18] font-black tracking-[-0.8px] text-[#1f1f1f]">
              给它一个真实的、带条件的问题
            </h2>
            <p className="mx-auto mt-5 mb-0 max-w-[560px] text-[16px] leading-7 text-[#5c5a54]">
              目前已经可以完整跑通对话与流式回答，检索链路正在逐阶段接入。
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a className={primaryButton} href="/app">
                开始一次检索
                <SendIcon size={18} strokeWidth={2} />
              </a>
              <a className={ghostButton} href={REPO_URL} target="_blank" rel="noreferrer">
                查看源码
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-[#e6e4dd] py-10">
        <div
          className={`${sectionShell} flex flex-wrap items-center justify-between gap-4 text-xs text-[#8a8881]`}
        >
          <span className="ctx-trigger inline-flex items-center gap-2.5">
            <ContextLogo size={20} wordmark={false} />
            Context · 以上下文为中心的检索 Agent
          </span>
          <span className="flex flex-wrap items-center gap-4">
            <a className="text-[#77746d] no-underline hover:text-[#d4491f]" href="/app">
              对话界面
            </a>
            <a className="text-[#77746d] no-underline hover:text-[#d4491f]" href="/?icons">
              图标总览
            </a>
            <a
              className="text-[#77746d] no-underline hover:text-[#d4491f]"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
