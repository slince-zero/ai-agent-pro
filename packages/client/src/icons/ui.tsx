import { IconBase, drawn, step, vars, type IconProps } from './Icon'

/** 发送：箭头飞出画布后从下方回位 */
export function SendIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <g data-a="send">
        <path d="M12 19.5V5.4" />
        <path d="M6 11.4 12 5.4l6 6" />
      </g>
    </IconBase>
  )
}

/** 停止生成：外圈描线，内部方块脉动 */
export function StopIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.6" data-a="draw" style={step(0)} {...drawn} />
      <rect
        x="8.8"
        y="8.8"
        width="6.4"
        height="6.4"
        rx="1.6"
        data-a="pulse"
        style={step(1)}
        fill="currentColor"
        stroke="none"
      />
    </IconBase>
  )
}

/** 附加文件：回形针轻微摆动 */
export function AttachIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <g data-a="wiggle">
        <path d="M13.6 9.4 8.9 14.1a2.4 2.4 0 0 0 3.3 3.3l6.4-6.4a4.7 4.7 0 0 0-6.5-6.5L5.6 11.3a7.2 7.2 0 0 0 9.8 9.8l2.4-2.4" />
      </g>
    </IconBase>
  )
}

/** 折叠 / 展开：箭头轻轻下沉一下，暗示它是可以点的 */
export function DisclosureIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6.8 9.8 12 15l5.2-5.2" data-a="rise" />
    </IconBase>
  )
}

/** 新对话：气泡描出，加号弹入 */
export function NewChatIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M7.6 5.2h8.8a3 3 0 0 1 3 3v5.2a3 3 0 0 1-3 3h-4.6l-3.6 3v-3h-.6a3 3 0 0 1-3-3V8.2a3 3 0 0 1 3-3z"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <path d="M12 8.6v4.4" data-a="pop" style={step(1)} />
      <path d="M9.8 10.8h4.4" data-a="pop" style={step(2)} />
    </IconBase>
  )
}

/** 历史记录：表盘描出，指针逆时针回拨 */
export function HistoryIcon({ duration = 1400, ...rest }: IconProps) {
  return (
    <IconBase duration={duration} {...rest}>
      <circle cx="12" cy="12" r="8.4" data-a="draw" style={step(0)} {...drawn} />
      <g data-a="orbit" data-origin="view">
        <path d="M12 12V7.4" />
        <path d="M12 12l3.4 2" />
      </g>
    </IconBase>
  )
}

/** 账户 */
export function AccountIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.6" data-a="draw" style={step(0)} {...drawn} />
      <circle cx="12" cy="10" r="3" data-a="pop" style={step(1)} />
      <path d="M6.6 19.4a5.8 5.8 0 0 1 10.8 0" data-a="pop" style={step(2)} />
    </IconBase>
  )
}

/** 复制：后层卡片错位滑出 */
export function CopyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect
        x="8.6"
        y="3.4"
        width="12"
        height="12"
        rx="2.8"
        data-a="slide-x"
        style={vars({ '--sx': '1.8px' })}
      />
      <rect x="3.4" y="8.6" width="12" height="12" rx="2.8" data-a="pop" style={step(1)} />
    </IconBase>
  )
}
