/**
 * Mermaid 图表渲染
 *
 * mermaid 解包后有一兆多，比这个界面其它所有代码加起来都大，
 * 所以它只能是「用到才下载」：这个模块由 markdown.tsx 懒加载，
 * 模块里再动态 import mermaid 本体。没有图表的对话完全不会碰到它。
 */
import { useEffect, useId, useRef, useState } from 'react'

type MermaidApi = (typeof import('mermaid'))['default']

let mermaidPromise: Promise<MermaidApi> | null = null

/**
 * 图表源码在流式输出时每帧都在变，而半截的图表必然画不出来。
 * 等它安静这么久再动手：省掉几十次无用解析，也不会闪一串错误图。
 */
const RENDER_DELAY_MS = 220

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      /**
       * 图表源码是模型写的，属于不可信输入。
       * strict 会让 mermaid 自己先清一遍标签，并且不执行图里的点击回调。
       */
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'inherit',
      // 跟着界面的纸感配色走，默认那套紫灰在这里像贴上去的
      themeVariables: {
        background: '#faf9f5',
        primaryColor: '#fff7f2',
        primaryBorderColor: '#eda98e',
        primaryTextColor: '#292824',
        secondaryColor: '#f2efe8',
        tertiaryColor: '#faf9f5',
        lineColor: '#b0aea8',
        textColor: '#34332f',
        fontSize: '14px',
      },
    })

    return mermaid
  })

  return mermaidPromise
}

type Drawing = {
  svg: string
  failed: boolean
}

const nothingDrawn: Drawing = { svg: '', failed: false }

export function MermaidDiagram({ source }: { source: string }) {
  /** mermaid 会拿这个 id 去查 DOM，useId 自带的冒号在选择器里是非法字符 */
  const baseId = `mermaid-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  /** 同一个 id 渲染两次会撞上上一次留下的临时节点，每次画都换一个 */
  const drawCountRef = useRef(0)
  const [drawing, setDrawing] = useState<Drawing>(nothingDrawn)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const mermaid = await loadMermaid()

        if (!active) return

        // 先 parse 挡一道：直接 render 失败时 mermaid 会往 document 上挂一张错误图
        const parsed = await mermaid.parse(source, { suppressErrors: true })

        if (!active) return

        if (!parsed) {
          // 已经画出来过就留着上一版，别在用户眼前把图换回代码
          setDrawing((current) => (current.svg ? current : { svg: '', failed: true }))
          return
        }

        drawCountRef.current += 1
        const { svg } = await mermaid.render(`${baseId}-${drawCountRef.current}`, source)

        if (!active) return

        setDrawing({ svg, failed: false })
      } catch {
        if (!active) return

        setDrawing((current) => (current.svg ? current : { svg: '', failed: true }))
      }
    }, RENDER_DELAY_MS)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [source, baseId])

  if (!drawing.svg) {
    // 还没画出来、或者根本画不出来时保持代码块的样子：图没了内容也还在
    return (
      <pre>
        <code>{source}</code>
      </pre>
    )
  }

  return (
    <div
      className="mermaid-figure"
      /* mermaid 在 strict 模式下已经把产物清洗过一遍，这里直接挂 svg */
      dangerouslySetInnerHTML={{ __html: drawing.svg }}
    />
  )
}
