import { IconBase, drawn, solid, step, vars, type IconProps } from './Icon'

/** 来源证据：被引用并高亮的原文片段 */
export function EvidenceIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.8 6.4v11.2" data-a="draw" style={step(0)} {...drawn} strokeWidth="2.4" />
      <path d="M7.6 8.2h12" data-a="draw" style={step(1)} {...drawn} />
      <path d="M7.6 12h8.6" data-a="draw" style={step(2)} {...drawn} />
      <rect
        x="7.4"
        y="14.4"
        width="7.6"
        height="3.2"
        rx="1.6"
        data-a="fill"
        data-origin="left"
        style={step(3)}
        fill="currentColor"
        stroke="none"
        opacity="0.24"
      />
    </IconBase>
  )
}

/** 语义重排：根据证据交换候选的位置 */
export function RerankIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect
        x="4.4"
        y="5.2"
        width="9"
        height="3"
        rx="1.5"
        data-a="swap-down"
        style={vars({ '--sd': '10.6px' })}
        fill="currentColor"
        stroke="none"
        opacity="0.85"
      />
      <rect
        x="4.4"
        y="10.5"
        width="14"
        height="3"
        rx="1.5"
        fill="currentColor"
        stroke="none"
        opacity="0.4"
      />
      <rect
        x="4.4"
        y="15.8"
        width="11.6"
        height="3"
        rx="1.5"
        data-a="swap-up"
        style={vars({ '--sd': '10.6px' })}
        fill="currentColor"
        stroke="none"
        opacity="0.65"
      />
    </IconBase>
  )
}

/** 上下文预算：已用额度向右生长，虚线是本轮上限 */
export function BudgetIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect
        x="3"
        y="7.6"
        width="15.6"
        height="8.8"
        rx="2.8"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <path d="M20.6 10.4v3.2" data-a="draw" style={step(1)} {...drawn} />
      <rect
        x="5"
        y="9.6"
        width="7.4"
        height="4.8"
        rx="1.6"
        data-a="fill"
        data-origin="left"
        style={step(2)}
        fill="currentColor"
        stroke="none"
        opacity="0.85"
      />
      <path d="M15.2 8.8v6.4" strokeDasharray="1.6 1.8" opacity="0.45" />
    </IconBase>
  )
}

/** Agent 循环：有限轮次内不断决定继续检索还是回答 */
export function AgentLoopIcon({ duration = 1500, ...rest }: IconProps) {
  return (
    <IconBase duration={duration} {...rest}>
      <g data-a="spin" data-origin="view" data-repeat="">
        <path d="M12 3.6a8.4 8.4 0 1 1-8.1 6.2" />
        <path d="M9.5 1 12 3.6 9.5 6.2z" {...solid} />
      </g>
      <circle cx="12" cy="12" r="2" data-a="pulse" data-repeat="" style={step(1)} {...solid} />
    </IconBase>
  )
}

/** 来源链接：证据与结论之间的可追溯关系 */
export function SourceIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M10.4 13.6H8.2a3.6 3.6 0 0 1 0-7.2h2.2"
        data-a="slide-x"
        style={vars({ '--sx': '1.6px' })}
      />
      <path
        d="M13.6 6.4h2.2a3.6 3.6 0 0 1 0 7.2h-2.2"
        data-a="slide-x"
        style={vars({ '--sx': '-1.6px' })}
      />
      <path d="M9 10h6" data-a="draw" style={step(1)} {...drawn} />
    </IconBase>
  )
}

/** 工具调用：一次进入工具、拿回结果的往返 */
export function ToolIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M9.2 4.8H7a2 2 0 0 0-2 2v10.4a2 2 0 0 0 2 2h2.2"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <path
        d="M14.8 4.8H17a2 2 0 0 1 2 2v10.4a2 2 0 0 1-2 2h-2.2"
        data-a="draw"
        style={step(1)}
        {...drawn}
      />
      {[9, 12, 15].map((cx, index) => (
        <circle
          key={cx}
          cx={cx}
          cy="12"
          r="1.3"
          data-a="blink"
          data-repeat=""
          style={step(index + 2)}
          {...solid}
        />
      ))}
    </IconBase>
  )
}
