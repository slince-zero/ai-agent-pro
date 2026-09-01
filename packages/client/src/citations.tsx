/**
 * 行内引用与来源脚注
 *
 * 答案里的 [1] 是模型写下的纯文本，服务端账本里的 ref 才是它真正指向的那份证据。
 * 这个文件负责把两者接起来：正文里的 [1] 变成能点开的角标，答案底下再列一份
 * 只包含真被引用过的来源的清单。
 *
 * 编号不是这里发的。发号的是服务端账本（同一个地址在一次运行里永远是同一个号），
 * 客户端只做匹配——认不出的号原样留在文字里，不去猜它想指哪一条。
 */
import { memo, useMemo } from 'react'
import type { EvidenceSource } from '@ai-agent-pro/shared/type.js'
import { readHost, readHostHue } from './util'
import { vars } from './icons'

/** 引用编号 → 这一次运行认领的那条来源 */
export type CitationMap = Map<number, EvidenceSource>

/**
 * [1]、[12]。
 *
 * 不接受 [0] 和前导零：那更像模型在写别的东西（数组下标、版本号里的片段），
 * 而三位数已经远超一次运行能产生的来源数，再宽只会多误伤。
 */
const CITATION_PATTERN = /\[([1-9]\d{0,2})\]/g

export function readCitations(sources: EvidenceSource[] | undefined): CitationMap | undefined {
  if (!sources || sources.length === 0) return undefined

  return new Map(sources.map((source) => [source.ref, source]))
}

/**
 * 只认这一棵树里需要动的那几种节点。
 *
 * 不从 'mdast' 引类型：@types/mdast 是 react-markdown 的间接依赖，不在本包的
 * 依赖表里。这里要读要写的字段就这么几个，写成结构类型比多加一个依赖便宜。
 */
type MdastNode = {
  type: string
  value?: string
  children?: MdastNode[]
}

type MdastLink = {
  type: 'link'
  url: string
  title: string | null
  children: MdastNode[]
  /** hProperties 会在 mdast → hast 那一步变成元素属性，className 因此要过白名单 */
  data: { hProperties: { className: string } }
}

/**
 * 这些节点不往里钻。
 *
 * link / linkReference 是因为 mdast 不允许链接套链接；definition 和
 * footnoteReference 里的方括号本来就是语法的一部分，不是引用。
 * 代码块（code / inlineCode / html）不带 text 子节点，天然不会被改写。
 */
const opaqueNodes = new Set(['link', 'linkReference', 'definition', 'footnoteReference'])

function citationNode(source: EvidenceSource): MdastLink {
  return {
    type: 'link',
    url: source.url,
    // 悬停就能看出这个角标指向哪一份证据，不必先点开
    title: source.title || source.url,
    children: [{ type: 'text', value: String(source.ref) }],
    data: { hProperties: { className: 'citation' } },
  }
}

/** 一段文字里的引用全部换成链接；一个都没有时返回 undefined，让调用方原样留着 */
function splitCitations(value: string, citations: CitationMap): MdastNode[] | undefined {
  const parts: MdastNode[] = []
  let cursor = 0

  for (const match of value.matchAll(CITATION_PATTERN)) {
    const source = citations.get(Number(match[1]))

    // 认不出的号原样留着：模型确实会写出账本里没有的编号，那不该变成一个点不开的角标
    if (!source) continue

    if (match.index > cursor) {
      parts.push({ type: 'text', value: value.slice(cursor, match.index) })
    }

    parts.push(citationNode(source))
    cursor = match.index + match[0].length
  }

  if (parts.length === 0) return undefined

  if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) })

  return parts
}

function transformCitations(node: MdastNode, citations: CitationMap) {
  const children = node.children

  if (!children) return

  const next: MdastNode[] = []
  let changed = false

  for (const child of children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const parts = splitCitations(child.value, citations)

      if (parts) {
        next.push(...parts)
        changed = true
        continue
      }
    } else if (!opaqueNodes.has(child.type)) {
      transformCitations(child, citations)
    }

    next.push(child)
  }

  if (changed) node.children = next
}

/**
 * 改写发生在 mdast 上，而不是先对字符串做替换。
 *
 * 字符串替换要自己判断"这个 [1] 是不是在代码块里"，而这件事只有解析器知道得准。
 * 走插件的话，代码块、行内代码、已有的链接都由 mdast 的节点类型天然隔开。
 */
export function remarkCitations(citations: CitationMap) {
  return () => (tree: MdastNode) => transformCitations(tree, citations)
}

/** 代码块里的 [1] 不是引用，脚注清单也不该把它算进去 */
function stripCode(content: string) {
  return content.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
}

/**
 * 脚注里只列真被引用过的来源。
 *
 * 检索过程那一栏已经把每次搜索的全部命中摆出来了；答案底下这一份要回答的是
 * 另一个问题——"这个结论是靠哪几页得出的"。把没引用的也列进来就又变成一堆链接。
 */
export function readCitedSources(content: string, citations: CitationMap | undefined) {
  if (!citations) return []

  const refs = new Set<number>()

  for (const match of stripCode(content).matchAll(CITATION_PATTERN)) refs.add(Number(match[1]))

  return [...citations.values()].filter((source) => refs.has(source.ref))
}

type AnswerSourcesProps = {
  content: string
  sources: EvidenceSource[] | undefined
}

/**
 * 答案底下的来源清单
 *
 * "已读正文"这个标记是有分量的：只有正文被真的读回来过的那一条，才够支撑
 * 版本号、许可证这类具体断言。只在搜索结果里露过脸的来源不带这个标记。
 */
export const AnswerSources = memo(function AnswerSources({ content, sources }: AnswerSourcesProps) {
  const cited = useMemo(() => readCitedSources(content, readCitations(sources)), [content, sources])

  if (cited.length === 0) return null

  return (
    <section className="answer-sources">
      <h2 className="answer-sources-title">来源</h2>
      <ol className="answer-sources-list">
        {cited.map((source, index) => {
          const host = readHost(source.url)

          return (
            <li
              className="answer-source"
              key={source.ref}
              style={vars({ '--i': index, '--hue': readHostHue(host) })}
            >
              <span className="answer-source-mark" aria-hidden="true">
                {source.ref}
              </span>
              <a
                className="answer-source-link"
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="answer-source-title">{source.title || source.url}</span>
                <span className="answer-source-host">{host}</span>
              </a>
              {source.read ? <span className="answer-source-read">已读正文</span> : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
})
