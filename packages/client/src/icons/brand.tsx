import type { CSSProperties } from 'react'
import { IconBase, drawn, solid, step, type IconProps } from './Icon'

/**
 * Context 品牌标记
 *
 * 三段同心弧向中心收敛，对应产品的核心想法：
 * 层层上下文（需求、约束、检索、证据）最终收敛到一个可解释的结论。
 * 弧线用墨色，收敛点用品牌橙。
 */
export function ContextMark({ strokeWidth = 2.1, ...rest }: IconProps) {
  return (
    <IconBase viewBox="0 0 32 32" strokeWidth={strokeWidth} {...rest}>
      <path d="M25.33 6.67A13.2 13.2 0 1 0 25.33 25.33" data-a="draw" style={step(0)} {...drawn} />
      <path d="M22.51 9.5A9.2 9.2 0 1 0 22.51 22.51" data-a="draw" style={step(1)} {...drawn} />
      <path d="M19.39 12.61A4.8 4.8 0 1 0 19.39 19.39" data-a="draw" style={step(2)} {...drawn} />
      <circle
        cx="16"
        cy="16"
        r="2.1"
        data-a="pop"
        style={step(3)}
        fill="var(--ctx-accent, #f05a2a)"
        stroke="none"
      />
    </IconBase>
  )
}

/** 收敛点向外扩散的涟漪，用于"正在检索"这类进行态的品牌动画 */
export function ContextPulse({ strokeWidth = 2.4, play = 'loop', ...rest }: IconProps) {
  return (
    <IconBase viewBox="0 0 32 32" strokeWidth={strokeWidth} play={play} {...rest}>
      <circle cx="16" cy="16" r="9" data-a="ripple" style={step(0)} opacity="0.9" />
      <circle cx="16" cy="16" r="9" data-a="ripple" style={step(1)} opacity="0.9" />
      <circle
        cx="16"
        cy="16"
        r="2.2"
        data-a="pulse"
        data-repeat=""
        fill="var(--ctx-accent, #f05a2a)"
        stroke="none"
      />
    </IconBase>
  )
}

type LogoProps = IconProps & {
  /** 是否显示 Context 文字，false 时只有标记 */
  wordmark?: boolean
}

/**
 * 完整 logo：标记 + 文字 + 手绘下划线。
 * 下划线呼应首页的橙色手绘装饰，在 hover 时从左向右画出。
 */
export function ContextLogo({ size = 28, wordmark = true, className = '', ...rest }: LogoProps) {
  return (
    <span className={`ctx-trigger inline-flex items-center gap-2.5 ${className}`}>
      <ContextMark size={size} {...rest} />
      {wordmark ? (
        <span
          className="relative leading-none font-extrabold tracking-[-1px]"
          style={{ fontSize: `${typeof size === 'number' ? size * 0.9 : 25}px` }}
        >
          Context
          <svg
            className="ctx-icon absolute -bottom-[0.22em] left-0 w-full"
            data-play="hover"
            viewBox="0 0 100 6"
            height="6"
            fill="none"
            stroke="var(--ctx-accent, #f05a2a)"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path
              d="M2 4.4C20 1.9 46 1.5 98 3.6"
              data-a="draw"
              pathLength={1}
              strokeDasharray={1}
              style={{ '--ctx-dur': '520ms' } as CSSProperties}
            />
          </svg>
        </span>
      ) : null}
    </span>
  )
}

/** 助手头像：品牌标记的双层简化版，适合放在消息流里 */
export function ContextAvatar({ size = 20, play = 'hover', ...rest }: IconProps) {
  return (
    <IconBase viewBox="0 0 32 32" size={size} play={play} strokeWidth={2.2} {...rest}>
      <path d="M23.07 8.93A10 10 0 1 0 23.07 23.07" data-a="draw" style={step(0)} {...drawn} />
      <path d="M19.82 12.18A5.4 5.4 0 1 0 19.82 19.82" data-a="draw" style={step(1)} {...drawn} />
      <circle cx="16" cy="16" r="2.1" data-a="pop" style={step(2)} {...solid} />
    </IconBase>
  )
}
