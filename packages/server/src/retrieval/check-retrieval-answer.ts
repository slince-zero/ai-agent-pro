import type { EvidenceSource, RetrievalIntent } from '@ai-agent-pro/shared/type.js'

function withoutCode(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
}

function citations(text: string) {
  return [...text.matchAll(/\[([1-9]\d*)\]/g)].map((match) => Number(match[1]))
}

/** 检查可确定的证据边界；不把“已读正文”误当成语义真实性的证明。 */
export function checkRetrievalAnswer(
  answer: string,
  sources: EvidenceSource[],
  intent?: RetrievalIntent,
): string[] {
  const text = withoutCode(answer)
  const refs = new Map(sources.map((source) => [source.ref, source]))
  const cited = citations(text)
  const issues: string[] = []
  if (/https?:\/\//i.test(answer)) issues.push('答案不能写裸链接，请使用本轮来源的 [ref]。')
  if (cited.some((ref) => !refs.has(ref))) issues.push('存在不属于本轮账本的引用编号。')
  if (cited.some((ref) => refs.has(ref) && !refs.get(ref)?.read))
    issues.push('引用了只搜索到、未读取正文的来源。')
  const unsupported = text.split('\n').filter((line) => {
    if (!line.includes('已确认')) return false
    const claim = line.replace(/[\s*#>\-:：|]/g, '').replace('已确认', '')
    return claim.length > 0 && !citations(line).some((ref) => refs.get(ref)?.read)
  })
  if (unsupported.length) issues.push('每条“已确认”的判断都必须在同一行引用本轮已读正文。')
  if (intent) {
    if (!cited.length && !/(无法确认|未找到|没有找到|找不到|证据不足)/.test(text)) {
      issues.push('检索答案需要引用已读正文；缺少证据时应明确说明无法确认。')
    }
    const conditions = [...intent.hardConstraints, ...intent.exclusions, ...intent.preferences]
    if (conditions.length && !text.includes('条件核对')) issues.push('缺少“条件核对”。')
    const normalized = text.replace(/[\s*]/g, '')
    const missing = conditions.filter(
      (condition) => !normalized.includes(condition.replace(/[\s*]/g, '')),
    )
    if (missing.length) issues.push(`条件核对缺少原文条件：${missing.join('；')}。`)
  }
  return issues
}
