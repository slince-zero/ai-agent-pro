import assert from 'node:assert/strict'
import { register } from 'node:module'
import { after, afterEach, beforeEach, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { act } from 'react'

// Node 不加载样式；布局与 CSS 交互另用真实浏览器检查。
register('./test-css-loader.mjs', import.meta.url)

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
const originals = new Map<string, PropertyDescriptor | undefined>()

function installGlobal(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}

installGlobal('window', dom.window)
installGlobal('document', dom.window.document)
installGlobal('HTMLElement', dom.window.HTMLElement)
installGlobal('IS_REACT_ACT_ENVIRONMENT', true)

const { createRoot } = await import('react-dom/client')
const { Demo } = await import('./Demo')
const { Navbar } = await import('./Navbar')
const { Reveal } = await import('./Reveal')
const { App } = await import('../App')

const observers: FakeIntersectionObserver[] = []
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let reducedMotion = false
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement

class FakeIntersectionObserver {
  target?: Element
  connected = false

  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    observers.push(this)
  }

  observe(target: Element) {
    this.target = target
    this.connected = true
  }

  disconnect() {
    this.connected = false
  }

  intersect(ratio: number) {
    const threshold = Number(this.options.threshold ?? 0)
    if (!this.connected || ratio < threshold) return
    this.callback(
      [
        {
          target: this.target,
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    )
  }
}

function tick(now: number) {
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(now)
}

beforeEach(() => {
  observers.length = 0
  frames.clear()
  frameId = 0
  reducedMotion = false
  installGlobal('IntersectionObserver', FakeIntersectionObserver)
  installGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  installGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  dom.window.matchMedia = (media) => ({
    matches: reducedMotion,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  assert.equal(frames.size, 0, '卸载后不应留下动画帧')
  assert.ok(
    observers.every((observer) => !observer.connected),
    '卸载后应断开观察器',
  )
})

after(() => {
  dom.window.close()
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

test('Reveal 只在首次进入视口时显示，并断开观察器', async () => {
  await act(() => root.render(<Reveal as="article">正文</Reveal>))
  const host = container.querySelector('article')!
  assert.equal(host.dataset.shown, 'false')
  await act(() => observers[0].intersect(0.02))
  assert.equal(host.dataset.shown, 'true')
  assert.equal(observers[0].connected, false)
  await act(() => observers[0].intersect(0))
  assert.equal(host.dataset.shown, 'true')
})

test('浏览器没有 IntersectionObserver 时正文仍显示', async () => {
  installGlobal('IntersectionObserver', undefined)
  await act(() => root.render(<Reveal>正文</Reveal>))
  assert.equal(container.querySelector<HTMLElement>('.reveal')?.dataset.shown, 'true')
})

test('Demo 仅露出 2% 也开始输出，完整回答从开始就可供读屏读取', async () => {
  await act(() => root.render(<Demo />))
  const fullAnswer = container.querySelector<HTMLElement>('p.grid > .opacity-0')!
  const visualAnswer = fullAnswer.nextElementSibling!
  assert.ok(fullAnswer.textContent!.includes('不能作为合格结果推荐'))
  assert.equal(visualAnswer.getAttribute('aria-hidden'), 'true')
  assert.equal(visualAnswer.textContent, '')
  await act(() => observers.forEach((observer) => observer.intersect(0.02)))
  await act(() => tick(0))
  await act(() => tick(500))
  assert.ok(visualAnswer.textContent!.length > 0)
  assert.ok(visualAnswer.textContent!.length < fullAnswer.textContent!.length)
  await act(() => tick(2000))
  assert.equal(visualAnswer.textContent, fullAnswer.textContent)
  assert.equal(container.querySelector('.stream-caret'), null)
})

test('减少动效时 Demo 无需等待进入视口或动画帧', async () => {
  reducedMotion = true
  await act(() => root.render(<Demo />))
  const fullAnswer = container.querySelector<HTMLElement>('p.grid > .opacity-0')!
  assert.equal(fullAnswer.nextElementSibling!.textContent, fullAnswer.textContent)
  assert.equal(frames.size, 0)
})

test('Demo 在输出中卸载会取消剩余动画帧', async () => {
  await act(() => root.render(<Demo />))
  await act(() => observers.forEach((observer) => observer.intersect(0.02)))
  await act(() => tick(0))
  assert.ok(frames.size > 0)
  // afterEach 检查卸载后没有残留的帧或观察器。
})

test('导航高亮跟随键盘焦点，并在焦点离开导航时消失', async () => {
  await act(() => root.render(<Navbar />))
  const link = container.querySelector<HTMLAnchorElement>('.glass-link')!
  const cta = container.querySelector<HTMLAnchorElement>('.glass-cta')!
  const pill = container.querySelector<HTMLElement>('.glass-pill')!
  await act(() => link.focus())
  assert.equal(pill.dataset.on, 'true')
  await act(() => {
    link.dispatchEvent(
      new dom.window.MouseEvent('pointerout', { bubbles: true, relatedTarget: cta }),
    )
  })
  assert.equal(pill.dataset.on, 'true', '鼠标离开时仍保留键盘焦点的高亮')
  await act(() => cta.focus())
  assert.equal(pill.dataset.on, undefined)
})

test('回答校验失败时清除草稿，保留条件和错误提示，不提供复制按钮', async () => {
  dom.window.HTMLElement.prototype.scrollIntoView = () => {}
  installGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  installGlobal(
    'fetch',
    async () =>
      new Response(
        [
          {
            type: 'retrieval_task',
            task: {
              mode: 'retrieve',
              intent: {
                target: 'Express 5 入门资料',
                contentType: '教程',
                hardConstraints: ['中文'],
                exclusions: [],
                preferences: [],
                ambiguities: [],
                language: '中文',
                timeRange: null,
              },
            },
          },
          { type: 'round_start', round: 1 },
          { type: 'text_delta', delta: '已确认：这是一份没有验证的草稿 [999]' },
          { type: 'error', message: '回答的来源核对未通过，请重试。' },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n'),
      ),
  )
  await act(() => root.render(<App />))
  const textarea = container.querySelector('textarea')!
  await act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      '找中文 Express 5 教程',
    )
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))
  })
  assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /来源核对未通过/)
  assert.ok(container.querySelector('[aria-label="本轮检索条件"]'))
  assert.doesNotMatch(
    container.querySelector('.assistant-prose')?.textContent ?? '',
    /没有验证的草稿/,
  )
  assert.equal(container.querySelector('[aria-label="复制回答"]'), null)
})
