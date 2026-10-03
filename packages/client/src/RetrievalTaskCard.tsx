import type { RetrievalTask } from '@ai-agent-pro/shared/type.js'
import { IntentIcon } from './icons'

export function RetrievalTaskCard({ task }: { task: RetrievalTask | undefined }) {
  if (!task || task.mode === 'chat') return null
  const { intent } = task
  const groups = [
    { label: '必须满足', items: intent.hardConstraints },
    { label: '排除', items: intent.exclusions },
    { label: '偏好', items: intent.preferences },
    { label: '待澄清', items: intent.ambiguities },
  ]
  const scope = [intent.contentType, intent.language, intent.timeRange].filter(Boolean)
  return (
    <section
      className="mb-5 rounded-2xl border border-[#e3e1db] bg-white/70 px-4 py-3.5 text-sm leading-6 text-[#5c5a54]"
      aria-label="本轮检索条件"
    >
      <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-[#34332f]">
        <IntentIcon size={16} play="none" />
        {task.mode === 'clarify' ? '需要你确认' : '本轮检索条件'}
      </h2>
      <p className="mt-2 mb-0 break-words text-[#292824]">{intent.target}</p>
      {scope.length ? <p className="m-0 text-xs text-[#77746d]">{scope.join(' · ')}</p> : null}
      <dl className="mt-2 mb-0 flex flex-col gap-1">
        {groups
          .filter((group) => group.items.length)
          .map((group) => (
            <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2" key={group.label}>
              <dt className="text-xs leading-6 text-[#8a8881]">{group.label}</dt>
              <dd className="m-0 break-words">{group.items.join('；')}</dd>
            </div>
          ))}
      </dl>
    </section>
  )
}
