import { IconBase, drawn, solid, step, type IconProps } from './Icon'

/** AI 回答 / 生成内容 */
export function SparkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M11 5.4c.83 3.04 1.57 3.78 4.6 4.6-3.03.82-3.77 1.56-4.6 4.6-.83-3.04-1.57-3.78-4.6-4.6 3.03-.82 3.77-1.56 4.6-4.6z"
        data-a="twinkle"
        style={step(0)}
      />
      <path
        d="M18 14.2c.41 1.52.78 1.89 2.3 2.3-1.51.41-1.88.78-2.3 2.3-.41-1.52-.78-1.89-2.3-2.3 1.51-.41 1.88-.78 2.3-2.3z"
        data-a="twinkle"
        style={step(1)}
      />
      <path
        d="M6.5 16.3c.31 1.12.58 1.39 1.7 1.7-1.12.31-1.39.58-1.7 1.7-.31-1.12-.58-1.39-1.7-1.7 1.12-.31 1.39-.58 1.7-1.7z"
        data-a="twinkle"
        style={step(2)}
      />
    </IconBase>
  )
}

/** 思考中 / 正在整理答案 */
export function ThinkingIcon({ play = 'loop', duration = 1100, ...rest }: IconProps) {
  return (
    <IconBase play={play} duration={duration} stagger={180} {...rest}>
      {[6.6, 12, 17.4].map((cx, index) => (
        <circle
          key={cx}
          cx={cx}
          cy="12"
          r="1.7"
          data-a="blink"
          data-repeat=""
          style={step(index)}
          {...solid}
        />
      ))}
    </IconBase>
  )
}

/** Token 用量：前五格已消耗，后四格是剩余预算 */
export function TokensIcon({ stagger = 55, ...rest }: IconProps) {
  return (
    <IconBase stagger={stagger} {...rest}>
      {Array.from({ length: 9 }, (_, index) => {
        const used = index < 5

        return (
          <rect
            key={index}
            x={4.2 + (index % 3) * 5.7}
            y={4.2 + Math.floor(index / 3) * 5.7}
            width="4.2"
            height="4.2"
            rx="1.3"
            data-a="pop"
            style={step(index)}
            fill={used ? 'currentColor' : 'none'}
            stroke={used ? 'none' : 'currentColor'}
            opacity={used ? 1 : 0.4}
          />
        )
      })}
    </IconBase>
  )
}

/** 条件已确认 */
export function ConfirmedIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.6" data-a="draw" style={step(0)} {...drawn} />
      <path d="M8.4 12.3l2.6 2.6 4.8-5.4" data-a="draw" style={step(1)} {...drawn} />
    </IconBase>
  )
}

/** 条件不满足 */
export function UnmetIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.6" data-a="draw" style={step(0)} {...drawn} />
      <path d="M9 9l6 6" data-a="draw" style={step(1)} {...drawn} />
      <path d="M15 9l-6 6" data-a="draw" style={step(2)} {...drawn} />
    </IconBase>
  )
}

/** 无法确认：虚线圈缓慢转动，表示证据不足而不是否定 */
export function UnknownIcon({ duration = 1800, ...rest }: IconProps) {
  return (
    <IconBase duration={duration} {...rest}>
      <circle cx="12" cy="12" r="8.6" strokeDasharray="2.4 2.9" data-a="spin" data-origin="view" />
      <path d="M10.1 10a1.95 1.95 0 1 1 2.9 1.95c-.65.45-1 .9-1 1.75" data-a="bounce" />
      <circle cx="12" cy="16.4" r="0.95" data-a="bounce" style={step(1)} {...solid} />
    </IconBase>
  )
}

/** 没有合格结果 */
export function EmptyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4.4 13.4 7 6.5a2 2 0 0 1 1.9-1.3h6.2A2 2 0 0 1 17 6.5l2.6 6.9v3.6a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2z"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <path d="M4.4 13.4h4.2l1 2h4.8l1-2h4.2" data-a="draw" style={step(1)} {...drawn} />
    </IconBase>
  )
}
