import type { CSSProperties } from 'react'
import { drawn, step } from './Icon'
import './motion.css'

type ConnectorArtProps = {
  className?: string
}

/**
 * 首屏手绘连线装饰
 *
 * 取代原来的 orange-connectors.png（55 KB 位图，缩放会模糊）：
 * 虚线曲线在挂载时沿路径扫过一次，节点和箭头随后描出，
 * 表达"上下文从两侧汇聚到中间那个问题"。
 * 中间 x 380–820 一段刻意留空，让标题落在里面不被压。
 */
export function ConnectorArt({ className = '' }: ConnectorArtProps) {
  return (
    <svg
      className={`ctx-icon ${className}`}
      data-play="once"
      style={{ '--ctx-dur': '1400ms', '--ctx-stagger': '110ms' } as CSSProperties}
      viewBox="0 0 1200 460"
      fill="none"
      stroke="#f05a2a"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g opacity="0.5" strokeDasharray="9 7">
        <path d="M40 296C132 342 214 300 268 234" data-a="flow" style={step(0)} />
        <path d="M96 392C170 366 234 380 286 342" data-a="flow" style={step(1)} />
        <path d="M1160 248C1058 300 988 266 928 208" data-a="flow" style={step(0)} />
        <path d="M1104 372C1030 348 966 364 916 328" data-a="flow" style={step(1)} />
      </g>

      <g opacity="0.72">
        <path d="M250 238 268 234 262 252" data-a="draw" style={step(3)} {...drawn} />
        <path d="M946 214 928 208 932 226" data-a="draw" style={step(3)} {...drawn} />
        <circle cx="40" cy="296" r="6" data-a="pop" style={step(4)} fill="#f05a2a" stroke="none" />
        <circle
          cx="1160"
          cy="248"
          r="6"
          data-a="pop"
          style={step(4)}
          fill="#f05a2a"
          stroke="none"
        />
        <path d="M1040 152 1054 166 1040 180 1026 166z" data-a="draw" style={step(5)} {...drawn} />
        <path d="M152 188v-24" data-a="draw" style={step(5)} {...drawn} />
        <path d="M168 202h24" data-a="draw" style={step(6)} {...drawn} />
        <path d="M1048 98 1076 70" data-a="draw" style={step(6)} {...drawn} />
        <path d="M1080 106 1098 88" data-a="draw" style={step(7)} {...drawn} />
      </g>
    </svg>
  )
}
