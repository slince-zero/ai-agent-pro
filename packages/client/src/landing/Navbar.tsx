import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ContextLogo, NewChatIcon } from '../icons'
import { REPO_URL } from './Hero'

/**
 * 悬浮玻璃导航
 *
 * 三层效果叠出"液态玻璃"的观感，各自解决一个问题：
 * - `backdrop-filter: blur + saturate`：背后的网格和光晕透上来但不干扰阅读，
 *   饱和度拉高是关键，否则毛玻璃会把下面的颜色洗成一片灰。
 * - 内侧一圈亮边（inset box-shadow）：玻璃的厚度感，缺了它就只是个半透明方块。
 * - 跟着指针走的高光：鼠标位置写进 --gx/--gy，由 CSS 画一团径向渐变。
 *   用 rAF 节流，pointermove 一帧最多改一次自定义属性。
 *
 * 另外那颗会滑动的胶囊：hover 到哪个链接就量一次它的位置，
 * 用带回弹的曲线移过去——这是"液态"最直观的那一下。
 */

const NAV_LINKS = [
  { href: '#how', label: '工作方式' },
  { href: '#demo', label: '界面' },
  { href: '#roadmap', label: '进度' },
] as const

type Pill = { x: number; width: number; on: boolean }

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [pill, setPill] = useState<Pill>({ x: 0, width: 0, on: false })

  const navRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const glowFrame = useRef(0)

  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 6)

    sync()
    window.addEventListener('scroll', sync, { passive: true })

    return () => window.removeEventListener('scroll', sync)
  }, [])

  useEffect(() => () => cancelAnimationFrame(glowFrame.current), [])

  const moveGlow = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bar = barRef.current

    if (!bar || glowFrame.current) return

    const box = bar.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top

    glowFrame.current = requestAnimationFrame(() => {
      glowFrame.current = 0
      bar.style.setProperty('--gx', `${x}px`)
      bar.style.setProperty('--gy', `${y}px`)
    })
  }

  const movePill = (target: HTMLElement) => {
    const nav = navRef.current

    if (!nav) return

    const item = target.getBoundingClientRect()
    const box = nav.getBoundingClientRect()

    setPill({ x: item.left - box.left, width: item.width, on: true })
  }

  return (
    <header className="pointer-events-none fixed top-0 z-50 w-full px-6 pt-4 max-[640px]:px-3 max-[640px]:pt-2.5">
      <div
        className="glass-bar pointer-events-auto mx-auto flex h-14 max-w-[1120px] items-center gap-3 pr-1.5 pl-3"
        data-scrolled={scrolled ? 'true' : undefined}
        ref={barRef}
        onPointerMove={moveGlow}
      >
        <a
          className="ctx-trigger shrink-0 rounded-lg text-[#1f1f1f] no-underline"
          href="/"
          aria-label="Context 首页"
        >
          <ContextLogo size={26} />
        </a>

        <nav
          className="relative flex flex-1 items-center justify-center gap-1 max-[820px]:hidden"
          aria-label="页面导航"
          ref={navRef}
          onPointerLeave={() => setPill((current) => ({ ...current, on: false }))}
        >
          <span
            className="glass-pill"
            data-on={pill.on ? 'true' : undefined}
            style={{ transform: `translate3d(${pill.x}px, 0, 0)`, width: `${pill.width}px` }}
            aria-hidden="true"
          />

          {NAV_LINKS.map((link) => (
            <a
              className="glass-link"
              key={link.href}
              href={link.href}
              onPointerEnter={(event) => movePill(event.currentTarget)}
              onFocus={(event) => movePill(event.currentTarget)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <a
            className="glass-ghost inline-flex max-[520px]:hidden"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a className="glass-cta inline-flex" href="/app">
            <NewChatIcon size={17} />
            打开对话
          </a>
        </div>
      </div>
    </header>
  )
}
