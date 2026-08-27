import type { CSSProperties, ReactNode } from 'react'
import './motion.css'

/**
 * 动画触发方式
 * - hover：鼠标悬停或键盘聚焦时播放一次（默认，也响应父级按钮的 hover）
 * - loop：持续循环，用于加载、检索中等进行态
 * - once：挂载时播放一次，用于结果出现、状态确认
 * - none：完全静态
 */
export type IconPlay = 'hover' | 'loop' | 'once' | 'none'

export type IconProps = {
  /** 像素尺寸，默认 24 */
  size?: number | string
  play?: IconPlay
  /** 单次动画时长（毫秒），默认 700 */
  duration?: number
  /** 同一图标内元素的出场间隔（毫秒），默认 80 */
  stagger?: number
  strokeWidth?: number
  className?: string
  /** 受控播放：true 时无视 hover 直接播放 */
  active?: boolean
  /**
   * 可访问名称。传入时图标作为 role="img" 暴露给读屏软件，
   * 不传则视为纯装饰并加上 aria-hidden。
   */
  title?: string
}

type IconBaseProps = IconProps & {
  children: ReactNode
  viewBox?: string
}

/** 描线动画所需属性：把路径长度归一化为 1，静止时是完整实线 */
export const drawn = { pathLength: 1, strokeDasharray: 1 } as const

/** 出场顺序 */
export function step(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

/** 自定义动画变量（--sx 水平位移、--sd 互换距离） */
export function vars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties
}

export function IconBase({
  size = 24,
  play = 'hover',
  duration,
  stagger,
  strokeWidth = 1.8,
  className = '',
  active,
  title,
  viewBox = '0 0 24 24',
  children,
}: IconBaseProps) {
  const style: CSSProperties = {}

  if (duration !== undefined) {
    Object.assign(style, { '--ctx-dur': `${duration}ms` })
  }
  if (stagger !== undefined) {
    Object.assign(style, { '--ctx-stagger': `${stagger}ms` })
  }

  return (
    <svg
      className={`ctx-icon ${className}`}
      data-play={play}
      data-active={active ? 'true' : undefined}
      style={style}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** 图标内部实心元素的公共属性 */
export const solid = { fill: 'currentColor', stroke: 'none' } as const
