import { IconBase, drawn, solid, step, vars, type IconProps } from './Icon'

/** 生成查询：把结构化需求翻译成关键词 */
export function QueryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10.4" cy="10.4" r="6.2" data-a="draw" style={step(0)} {...drawn} />
      <path d="M14.9 14.9 20 20" data-a="draw" style={step(1)} {...drawn} />
      <path d="M7.4 9.2h6" data-a="draw" style={step(2)} {...drawn} opacity="0.9" />
      <path d="M7.4 12h3.6" data-a="draw" style={step(3)} {...drawn} opacity="0.9" />
    </IconBase>
  )
}

/** 搜索互联网：地球外有一个正在巡游的探针 */
export function SearchWebIcon({ duration = 1600, ...rest }: IconProps) {
  return (
    <IconBase duration={duration} {...rest}>
      <circle cx="12" cy="12" r="7.4" data-a="draw" style={step(0)} {...drawn} />
      <path
        d="M12 4.6c2.35 2.07 2.35 12.73 0 14.8-2.35-2.07-2.35-12.73 0-14.8z"
        data-a="draw"
        style={step(1)}
        {...drawn}
      />
      <path d="M4.6 12h14.8" data-a="draw" style={step(2)} {...drawn} />
      <circle
        cx="12"
        cy="1.5"
        r="1.5"
        data-a="orbit"
        data-origin="view"
        data-repeat=""
        {...solid}
      />
    </IconBase>
  )
}

/** 读取页面：扫描线在正文上来回移动 */
export function ReadPageIcon({ duration = 1500, ...rest }: IconProps) {
  return (
    <IconBase duration={duration} {...rest}>
      <path
        d="M6.6 4.2h6.6l4.2 4.2v9.6a1.6 1.6 0 0 1-1.6 1.6H8.2a1.6 1.6 0 0 1-1.6-1.6z"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <path d="M13.2 4.2v4.2h4.2" data-a="draw" style={step(1)} {...drawn} />
      <path d="M9.2 12.4h5.6" opacity="0.32" />
      <path d="M9.2 15.4h3.6" opacity="0.32" />
      <path d="M9.2 13.9h4.4" data-a="scan" data-repeat="" strokeWidth="2" />
    </IconBase>
  )
}

/** 候选结果：来自搜索来源的待检查列表 */
export function CandidatesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      {[4.6, 10.2, 15.8].map((y, index) => (
        <g key={y} data-a="slide-x" style={{ ...step(index), ...vars({ '--sx': '1.8px' }) }}>
          <circle cx="4.6" cy={y + 1.8} r="1.5" {...solid} />
          <rect x="7.6" y={y} width="12" height="3.6" rx="1.8" />
        </g>
      ))}
    </IconBase>
  )
}

/** 确定性过滤：先用明确元数据筛掉不合格的候选 */
export function FilterIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M4.2 3.8h15.6L13.6 10.6v3.4l-3.2 1.8v-5.2z"
        data-a="draw"
        style={step(0)}
        {...drawn}
      />
      <circle cx="12" cy="19.4" r="1.7" data-a="drop" style={step(1)} {...solid} />
    </IconBase>
  )
}
