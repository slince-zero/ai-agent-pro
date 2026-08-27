import type { PetBehavior, PetDef, PetInk } from './sprites'

/**
 * 把字符网格画成 SVG
 *
 * 同一行里连续的同色像素会合成一个 `<rect>`：一只宠物本来有 90 个格子，
 * 合并之后只剩十几个矩形，切帧时浏览器要重绘的东西也就少了一个数量级。
 *
 * 两帧同时挂在 DOM 里，用 `data-frame` 决定显示哪一组（见 pet.css）。
 * 这样动画期间只改一个属性，不必让 React 每秒重渲染六七次。
 */

type Run = { x: number; y: number; width: number; ink: PetInk }

function runsOf(frame: readonly string[]): Run[] {
  const runs: Run[] = []

  frame.forEach((row, y) => {
    let x = 0

    while (x < row.length) {
      const ink = row[x]

      if (ink === '.' || ink === undefined) {
        x += 1
        continue
      }

      let width = 1
      while (row[x + width] === ink) width += 1

      runs.push({ x, y, width, ink: ink as PetInk })
      x += width
    }
  })

  return runs
}

type PetSpriteProps = {
  pet: PetDef
  behavior: PetBehavior
  /** 一个像素放大成几个 CSS 像素；取整数才不会出现半像素的锯齿 */
  scale: number
  className?: string
}

export function PetSprite({ pet, behavior, scale, className = '' }: PetSpriteProps) {
  const frames = pet.frames[behavior]
  const rows = frames[0].length
  const cols = frames[0][0]?.length ?? 0

  return (
    <svg
      className={`pet-sprite ${className}`}
      data-frame="0"
      width={cols * scale}
      height={rows * scale}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {frames.map((frame, index) => (
        <g key={index}>
          {runsOf(frame).map((run) => (
            <rect
              key={`${run.y}-${run.x}`}
              x={run.x}
              y={run.y}
              width={run.width}
              height={1}
              fill={pet.palette[run.ink]}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}
