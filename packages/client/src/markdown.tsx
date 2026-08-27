/**
 * 助手回答的 Markdown 渲染
 *
 * 「怎么把一段 Markdown 变成屏幕上的东西」这件事全部收口在这里：
 * 插件、图片、代码块各自的处理都在这个文件，App 只负责给出
 * 「一段文本」和「是不是还在流」这两个信息。
 */
import { Component, Suspense, isValidElement, lazy, useState } from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import Markdown from 'react-markdown'
import type { Components, Options } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { closeDanglingMarkdown } from './streaming-markdown'

const remarkPlugins = [remarkGfm]

/**
 * 模型不总是写 Markdown
 *
 * 它经常直接写 HTML：<img>、带 colspan 的 <table>、<br>。react-markdown 默认
 * 把这些标签当纯文本吐出来，屏幕上就是一串尖括号——这也是「图片显示不出来」
 * 最常见的一种。rehype-raw 负责把它们真的解析成节点。
 *
 * 但模型的输出是不可信内容，所以后面必须紧跟一道白名单清洗：少了它，
 * 一个 <img src=x onerror=...> 就能在这个页面里执行脚本。顺序不能颠倒。
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // 默认白名单不含尺寸，模型写 <img width="300"> 时那张图会被撑成原始大小
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height'],
  },
}

const rehypePlugins: NonNullable<Options['rehypePlugins']> = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
]

/** 图表渲染器连 mermaid 一起有一兆多，等真的出现图表再下载 */
const MermaidDiagram = lazy(() =>
  import('./mermaid-diagram').then(({ MermaidDiagram: Diagram }) => ({ default: Diagram })),
)

/** react-markdown 会把解析出的 hast 节点一起塞给组件，别把它透传给 DOM */
type MarkdownProps<Tag extends keyof HTMLElementTagNameMap> = ComponentPropsWithoutRef<Tag> & {
  node?: unknown
}

/**
 * 图片：加载失败时给个能看懂的兜底
 *
 * 模型很爱编图片地址，或者给一个已经下线的图床。浏览器默认的处理是把 alt 文字
 * 摊在原地——一行小字，看起来就像回答里少了一块，用户根本判断不出是模型编的、
 * 网断了，还是界面坏了。这里明确说出来，并且留一个链接让人自己去验。
 */
function MarkdownImage({ src, alt, title, width, height }: MarkdownProps<'img'>) {
  /**
   * 记「哪个地址坏了」而不是「坏没坏」：流式输出时 src 会从
   * `https://exa` 一路长到完整地址，中途每一版都注定加载失败，
   * 用布尔值的话第一次失败就再也翻不了身。
   */
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  const label = alt?.trim()

  if (!src || brokenSrc === src) {
    return (
      <span className="image-fallback">
        <span className="image-fallback-title">图片无法加载</span>
        {label ? <span>{label}</span> : null}
        {src ? (
          <a href={src} target="_blank" rel="noreferrer noopener">
            打开原地址
          </a>
        ) : null}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt ?? ''}
      title={title}
      width={width}
      height={height}
      /* 长回答里可能有十几张图，滚到了再下载 */
      loading="lazy"
      decoding="async"
      onError={() => setBrokenSrc(src)}
    />
  )
}

/**
 * 图表兜底
 *
 * 图表渲染器是懒加载的：chunk 拉不下来、mermaid 自己在渲染里抛错，
 * 都不该让整段回答跟着白掉。出问题就退回代码块，内容至少还在。
 */
class DiagramBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function toText(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(toText).join('')

  return ''
}

/**
 * 代码块：```mermaid 换成图表，其余照常
 *
 * 在 pre 这一层判断，是因为图表不该套在代码块的深色外壳里——
 * 一张浅色的流程图裹在墨色方框里会突兀得像贴错了地方。
 */
function MarkdownPre({ children }: MarkdownProps<'pre'>) {
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children)
    ? children
    : null
  const language = /language-(\w+)/.exec(code?.props.className ?? '')?.[1]

  if (language !== 'mermaid') {
    return <pre>{children}</pre>
  }

  const source = toText(code?.props.children)
  const sourceBlock = (
    <pre>
      <code>{source}</code>
    </pre>
  )

  return (
    <DiagramBoundary fallback={sourceBlock}>
      {/* chunk 还在路上时先显示源码，图画好了再换过去 */}
      <Suspense fallback={sourceBlock}>
        <MermaidDiagram source={source} />
      </Suspense>
    </DiagramBoundary>
  )
}

const components: Components = {
  img: MarkdownImage,
  pre: MarkdownPre,
}

type AssistantMarkdownProps = {
  content: string
  /** 还在流的时候要先把半截语法补齐，见 closeDanglingMarkdown */
  streaming?: boolean
}

export function AssistantMarkdown({ content, streaming = false }: AssistantMarkdownProps) {
  return (
    <Markdown components={components} rehypePlugins={rehypePlugins} remarkPlugins={remarkPlugins}>
      {streaming ? closeDanglingMarkdown(content) : content}
    </Markdown>
  )
}
