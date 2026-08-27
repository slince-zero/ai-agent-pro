import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import './landing.css'

/**
 * 浏览器是否支持滚动驱动动画。
 * 支持时揭示动画完全交给 CSS（合成线程执行，滚动中不产生 JS 回调），
 * 因此不必再创建 IntersectionObserver。Firefox 目前会走 false 分支。
 */
const supportsScrollTimeline =
  typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: view()')

type RevealProps = {
  children: ReactNode
  /** 同一组元素的出场序号，乘以 90ms 作为延迟 */
  order?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'article'
}

/**
 * 滚动进入视口时揭示内容。
 *
 * 观察器命中一次就断开：揭示是一次性的，没必要为向上滚动保留监听。
 * rootMargin 的负底边让元素露出约 12% 才触发，避免"刚碰到屏幕边就播完"。
 */
export function Reveal({ children, order = 0, className = '', as = 'div' }: RevealProps) {
  const hostRef = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(supportsScrollTimeline)

  useEffect(() => {
    if (supportsScrollTimeline) return

    const host = hostRef.current

    if (!host) return

    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return

        setShown(true)
        observer.disconnect()
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
    )

    observer.observe(host)

    return () => observer.disconnect()
  }, [])

  const Host = as

  return (
    <Host
      className={`reveal ${className}`}
      data-shown={shown ? 'true' : 'false'}
      ref={hostRef as never}
      style={{ '--r': order } as CSSProperties}
    >
      {children}
    </Host>
  )
}
