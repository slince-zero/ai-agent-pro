import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from '../icons'
import { Reveal } from './Reveal'

export const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#f05a2a]/30 focus-visible:outline-offset-[3px]'

/** 主按钮：深墨底，hover 转品牌橙，只动颜色和位移 */
export const primaryButton = `${focusRing} inline-flex h-12 items-center gap-2 rounded-full border-0 bg-[#1f1f1f] px-6 text-[15px] font-semibold text-[#faf9f5] no-underline shadow-[0_10px_24px_rgba(31,31,31,0.16)] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#f05a2a] hover:shadow-[0_14px_30px_rgba(240,90,42,0.26)] active:translate-y-0`

/** 次按钮：描边，hover 变橙 */
export const ghostButton = `${focusRing} inline-flex h-12 items-center gap-2 rounded-full border border-[#c9c7c0] bg-white/70 px-6 text-[15px] font-semibold text-[#34332f] no-underline transition-[border-color,color,transform] duration-200 hover:-translate-y-0.5 hover:border-[#f05a2a]/45 hover:text-[#d4491f]`

/** 图标底座，与 App 内助手头像同一套配色 */
export const iconChip =
  'grid place-items-center rounded-2xl border border-[#f05a2a]/25 bg-[#fff7f2] text-[#e34f22]'

export const sectionShell =
  'mx-auto w-[calc(100%_-_48px)] max-w-[1120px] max-[640px]:w-[calc(100%_-_32px)]'

type EyebrowProps = {
  icon: ComponentType<IconProps>
  children: ReactNode
}

/** 分节小标签：一个会在 hover 时播放的图标 + 一行说明 */
export function Eyebrow({ icon: Icon, children }: EyebrowProps) {
  return (
    <span className="ctx-trigger inline-flex items-center gap-2 rounded-full border border-[#e3e1db] bg-white/70 px-3.5 py-1.5 text-xs font-semibold tracking-[0.02em] text-[#77746d]">
      <Icon size={15} />
      {children}
    </span>
  )
}

type SectionHeadingProps = {
  eyebrow?: ReactNode
  title: string
  description?: string
  align?: 'left' | 'center'
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
}: SectionHeadingProps) {
  const alignment = align === 'center' ? 'items-center text-center' : 'items-start text-left'

  return (
    <Reveal className={`flex flex-col gap-4 ${alignment}`}>
      {eyebrow}
      <h2 className="m-0 text-[clamp(26px,3.2vw,38px)] leading-[1.2] font-black tracking-[-0.6px] text-[#1f1f1f]">
        {title}
      </h2>
      {description ? (
        <p className="m-0 max-w-[620px] text-[16px] leading-7 text-[#5c5a54]">{description}</p>
      ) : null}
    </Reveal>
  )
}
