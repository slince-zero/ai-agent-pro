/**
 * 流式渲染时的 Markdown 收尾补全
 *
 * 逐字输出会让 Markdown 在半路上一直处于语法不完整的状态：
 * `**Deep` 这样的片段在闭合的 `**` 到达之前，会以裸星号的样子停在屏幕上，
 * 未闭合的围栏代码块更是会把整段代码当成普通文字甩出来。
 *
 * 这里不做完整解析，只针对最常见的几种"半个标记"做临时收尾：
 * 猜错的代价很小——下一个增量到达时整段会重新解析，自己就纠正了。
 */

/**
 * 结尾处孤零零的标记字符，补也补不出意义，直接藏掉。
 *
 * 反引号不在这里处理：三个反引号是完整的围栏收尾，删掉其中一部分会让下面的
 * 配对逻辑以为围栏还开着，反而在代码块末尾补出一行乱码。反引号交给配对逻辑。
 * 其余成对标记（`**`、`~~`）删掉后也会被配对逻辑原样补回来。
 */
const danglingTail = /(?:\*{1,3}|~{1,2}|#{1,6}|!?\[|\|)[ \t]*$/

/**
 * 行内标记：只吐出了一半、还没配对的，先临时补上另一半。
 * 顺序有讲究——先处理围栏，才不会把围栏的三个反引号算进行内代码。
 */
const inlinePairs = ['```', '**', '~~', '`'] as const

export function closeDanglingMarkdown(text: string): string {
  if (!text) return text

  // 先去掉末尾那半个标记，否则下面刚补上的收尾又会被它带走
  let result = text.replace(danglingTail, '')

  for (const pair of inlinePairs) {
    const count = result.split(pair).length - 1

    if (count % 2 === 0) continue

    // 围栏代码块要另起一行收尾，行内标记直接接在后面
    result += pair === '```' ? `\n${pair}` : pair
  }

  return result
}
