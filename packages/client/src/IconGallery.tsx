import { useState } from 'react'
import { ContextLogo } from './icons/brand'
import { iconGroups, iconRegistry, type IconGroupKey } from './icons/registry'
import type { IconPlay } from './icons/Icon'

const playModes: { value: IconPlay; label: string; hint: string }[] = [
  { value: 'hover', label: '悬停播放', hint: '鼠标移到卡片或图标上，也响应键盘聚焦' },
  { value: 'loop', label: '循环播放', hint: '用于加载、检索中等进行态' },
  { value: 'none', label: '静态', hint: '完成态，也是减少动效时的表现' },
]

const sizes = [20, 28, 40]

const groupKeys = Object.keys(iconGroups) as IconGroupKey[]

const chip =
  'cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors'

export function IconGallery() {
  const [play, setPlay] = useState<IconPlay>('hover')
  const [size, setSize] = useState(28)

  const activeHint = playModes.find((mode) => mode.value === play)?.hint ?? ''

  return (
    <div className="min-h-svh bg-[#faf9f5] bg-[url('/assets/grid-paper.png')] bg-[length:1440px_auto] font-sans text-[#1f1f1f] antialiased">
      <header className="sticky top-0 z-10 border-b border-[#deddd7] bg-[#faf9f5]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <ContextLogo size={26} />
          <div className="flex flex-wrap items-center gap-2">
            {playModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setPlay(mode.value)}
                className={`${chip} ${
                  play === mode.value
                    ? 'border-[#f05a2a] bg-[#fff1ea] text-[#d4491f]'
                    : 'border-[#deddd7] bg-white/70 text-[#5c5a54] hover:border-[#c9c7c0]'
                }`}
              >
                {mode.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-[#deddd7]" />
            {sizes.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSize(value)}
                className={`${chip} ${
                  size === value
                    ? 'border-[#1f1f1f] bg-[#1f1f1f] text-white'
                    : 'border-[#deddd7] bg-white/70 text-[#5c5a54] hover:border-[#c9c7c0]'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-6 pt-10 pb-20">
        <h1 className="m-0 text-[clamp(30px,4vw,44px)] leading-tight font-black tracking-[-2px]">
          Context 图标与动效
        </h1>
        <p className="mt-3 mb-0 max-w-[620px] text-[15px] leading-7 text-[#5c5a54]">
          {iconRegistry.length} 个 24×24 网格、1.8 描边、纯 CSS 动画的图标。 当前 {activeHint}。
        </p>

        {groupKeys.map((groupKey) => {
          const entries = iconRegistry.filter((entry) => entry.group === groupKey)

          return (
            <section key={groupKey} className="mt-12">
              <h2 className="m-0 flex items-baseline gap-3 text-lg font-bold tracking-[-0.5px]">
                {iconGroups[groupKey]}
                <span className="text-xs font-medium text-[#8a8881]">{entries.length} 个</span>
              </h2>
              <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
                {entries.map(({ name, label, usage, Icon }) => (
                  <article
                    key={name}
                    className="ctx-trigger flex items-center gap-3.5 rounded-2xl border border-[#e3e1db] bg-white/75 px-4 py-3.5 transition-colors hover:border-[#f05a2a]/45 hover:bg-white"
                    tabIndex={0}
                  >
                    <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-[#f05a2a]/25 bg-[#fff7f2] text-[#e34f22]">
                      <Icon size={size} play={play} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#292824]">
                        {label}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-[#a3a09a]">
                        {name}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-[#77746d]">
                        {usage}
                      </span>
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}
