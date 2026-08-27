import { IconBase, drawn, solid, step, type IconProps } from './Icon'

/** 检索目标：需求被解析成一个明确的靶心 */
export function IntentIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="7.6" data-a="draw" style={step(0)} {...drawn} />
      <circle cx="12" cy="12" r="3.4" data-a="draw" style={step(1)} {...drawn} />
      <circle cx="12" cy="12" r="1.5" data-a="pop" style={step(2)} {...solid} />
      <path
        d="M12 1.2v1.7M12 21.1v1.7M1.2 12h1.7M21.1 12h1.7"
        data-a="draw"
        style={step(3)}
        {...drawn}
      />
    </IconBase>
  )
}

/** 硬条件：必须满足，否则不能成为结果 */
export function MustIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 3.4 5.6 6.1v5.6c0 4.3 2.7 7.2 6.4 8.9 3.7-1.7 6.4-4.6 6.4-8.9V6.1z"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <path d="M9.2 12l2.2 2.2 3.8-4.4" data-a="draw" style={step(1)} {...drawn} />
    </IconBase>
  )
}

/** 排除条件：命中即淘汰 */
export function ExcludeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.6" data-a="draw" style={step(0)} {...drawn} />
      <path d="M6.6 17.4 17.4 6.6" data-a="draw" style={step(1)} {...drawn} />
    </IconBase>
  )
}

/** 软偏好：只影响排序、不直接淘汰，所以描边之上只压一层很淡的填充 */
export function PreferIcon(props: IconProps) {
  const star = 'M12 4.4l2.34 4.74 5.26.76-3.8 3.7.9 5.22L12 16.4l-4.7 2.42.9-5.22-3.8-3.7 5.26-.76z'

  return (
    <IconBase {...props}>
      <path d={star} data-a="draw" style={step(0)} {...drawn} />
      <path
        d={star}
        data-a="pop"
        style={step(1)}
        fill="currentColor"
        stroke="none"
        opacity="0.18"
      />
    </IconBase>
  )
}

/** 澄清问题：条件模糊且会显著改变结果时反问一句 */
export function ClarifyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M7.6 5.2h8.8a3 3 0 0 1 3 3v5.2a3 3 0 0 1-3 3h-4.6l-3.6 3v-3h-.6a3 3 0 0 1-3-3V8.2a3 3 0 0 1 3-3z"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <path
        d="M10.2 9.2a1.85 1.85 0 1 1 2.8 1.85c-.62.42-.95.85-.95 1.6"
        data-a="bounce"
        style={step(1)}
      />
      <circle cx="12" cy="14.3" r="0.9" data-a="bounce" style={step(2)} {...solid} />
    </IconBase>
  )
}
