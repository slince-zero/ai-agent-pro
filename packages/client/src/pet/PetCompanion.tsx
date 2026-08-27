import { useCallback, useEffect, useRef, useState } from 'react'
import { PetSprite } from './PetSprite'
import { PET_LIST, PETS, isPetId, type PetBehavior, type PetId } from './sprites'
import './pet.css'

/**
 * 输入框上面散步的小宠物
 *
 * 一条只有 32px 高的"地面"，宠物在上面来回走、坐下、睡觉，点一下会跳一下。
 * 输入框顶部的那条描边就是它脚下的地面，所以轨道左右各留出 28px：
 * 圆角那一段不是直线，宠物走上去会看着像浮在空中。
 *
 * 三个刻意的取舍：
 * - 位移和切帧都直接写 DOM，不走 React state。等回答的时候正文在逐字重排，
 *   宠物没有理由每秒再多触发六七次渲染。
 * - 行为（走 / 坐 / 睡）才是 state，几秒一次，交给 React 换精灵图。
 * - `prefers-reduced-motion` 下整个 rAF 循环都不启动，宠物就坐在那里。
 */

const STORAGE_KEY = 'ctx-pet'

/** 一个像素放大成 3 个 CSS 像素：10×9 的网格正好是 30×27 */
const SCALE = 3

/** 转身时离两端留出的余量 */
const EDGE_INSET = 6

const FRAME_MS: Record<PetBehavior, number> = { walk: 155, idle: 640, sleep: 1500 }

/** 每种行为持续多久（毫秒）就换下一个 */
const SPAN_MS: Record<PetBehavior, readonly [number, number]> = {
  walk: [2600, 6200],
  idle: [1600, 4200],
  sleep: [5000, 11000],
}

type Choice = PetId | 'off'

function readChoice(): Choice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw === 'off' || isPetId(raw)) return raw
  } catch {
    // 隐私模式下 localStorage 会直接抛，用默认宠物就好
  }

  return 'dog'
}

function writeChoice(choice: Choice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // 存不下就算了，只是下次打开会回到默认宠物
  }
}

function randomBetween(range: readonly [number, number]) {
  return range[0] + Math.random() * (range[1] - range[0])
}

/** 走累了会歇，歇久了会睡，睡醒继续走 */
function nextBehavior(current: PetBehavior): PetBehavior {
  const roll = Math.random()

  if (current === 'walk') return roll < 0.68 ? 'idle' : 'walk'
  if (current === 'idle') return roll < 0.62 ? 'walk' : 'sleep'

  return 'walk'
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)

    sync()
    query.addEventListener('change', sync)

    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

type PetActorProps = {
  petId: PetId
  /** 正在等回答：宠物跟着一起快走，不会在这时候躺下 */
  busy: boolean
}

function PetActor({ petId, busy }: PetActorProps) {
  const pet = PETS[petId]
  const reduced = usePrefersReducedMotion()
  const [behavior, setBehavior] = useState<PetBehavior>('walk')

  const trackRef = useRef<HTMLDivElement>(null)
  const actorRef = useRef<HTMLButtonElement>(null)
  const hopRef = useRef<HTMLSpanElement>(null)
  const flipRef = useRef<HTMLSpanElement>(null)

  /** 位置、朝向、当前帧全放在 ref 里：换宠物或忙碌状态变化时不该让它回到原点 */
  const motion = useRef({
    x: -1,
    dir: 1,
    behavior: 'walk' as PetBehavior,
    until: 0,
    frame: 0,
    acc: 0,
  })

  useEffect(() => {
    const track = trackRef.current
    const actor = actorRef.current
    const flip = flipRef.current
    const sprite = actor?.querySelector('svg')

    if (!track || !actor || !flip || !sprite) return

    const state = motion.current
    let width = track.clientWidth

    const maxX = () => Math.max(0, width - actor.offsetWidth - EDGE_INSET)

    // 第一次出现在偏右的位置，正好在发送按钮上方
    if (state.x < 0) state.x = maxX() * 0.72

    const paint = () => {
      actor.style.transform = `translate3d(${Math.round(state.x)}px, 0, 0)`
      // 精灵图默认朝右（尾巴在左边），往左走才需要翻面
      flip.style.transform = state.dir === -1 ? 'scaleX(-1)' : 'none'
    }

    const observer = new ResizeObserver(() => {
      width = track.clientWidth

      if (state.x > maxX()) {
        state.x = maxX()
        paint()
      }
    })

    observer.observe(track)
    paint()

    if (reduced) {
      setBehavior('idle')

      return () => observer.disconnect()
    }

    let frame = 0
    let last = performance.now()

    if (state.until === 0) state.until = last + randomBetween(SPAN_MS.walk)

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)

      // 标签页切回来时 now - last 会是几十秒；夹住上限，宠物才不会一瞬间闪到另一头
      const dt = Math.min(now - last, 100)
      last = now

      if (busy && state.behavior !== 'walk') {
        state.behavior = 'walk'
        state.until = now + randomBetween(SPAN_MS.walk)
        setBehavior('walk')
      }

      if (now >= state.until) {
        const next = busy ? 'walk' : nextBehavior(state.behavior)

        state.behavior = next
        state.until = now + randomBetween(SPAN_MS[next])
        setBehavior(next)
      }

      if (state.behavior === 'walk') {
        const limit = maxX()

        state.x += state.dir * pet.speed * (busy ? 1.9 : 1) * (dt / 1000)

        if (state.x <= 0) {
          state.x = 0
          state.dir = 1
        } else if (state.x >= limit) {
          state.x = limit
          state.dir = -1
        }
      }

      state.acc += dt

      const frameMs =
        state.behavior === 'walk' && busy ? FRAME_MS.walk * 0.6 : FRAME_MS[state.behavior]

      if (state.acc >= frameMs) {
        state.acc = 0
        state.frame = state.frame === 0 ? 1 : 0
        sprite.dataset.frame = String(state.frame)
      }

      paint()
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [pet, busy, reduced])

  const hop = useCallback(() => {
    const element = hopRef.current

    if (!element || reduced) return

    element.classList.remove('is-hop')
    // 读一次布局强制重排，同一个动画才能从头再播一遍
    void element.offsetWidth
    element.classList.add('is-hop')
  }, [reduced])

  return (
    <div className="pet-track" ref={trackRef}>
      <button
        className="pet-actor"
        data-behavior={behavior}
        ref={actorRef}
        type="button"
        // 纯装饰的彩蛋：读屏软件里没有意义，键盘用户走下面的宠物设置按钮
        aria-hidden="true"
        tabIndex={-1}
        onClick={hop}
      >
        {pet.float ? null : <span className="pet-shadow" />}
        <span className="pet-bob" data-float={pet.float ? 'true' : undefined}>
          <span
            className="pet-hop"
            ref={hopRef}
            onAnimationEnd={() => hopRef.current?.classList.remove('is-hop')}
          >
            <span className="pet-flip" ref={flipRef}>
              <PetSprite pet={pet} behavior={behavior} scale={SCALE} />
            </span>
            <span className="pet-zzz">z</span>
            <span className="pet-zzz pet-zzz-late">z</span>
          </span>
        </span>
      </button>
    </div>
  )
}

function PawIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <ellipse cx="4.1" cy="5.4" rx="1.5" ry="2" />
      <ellipse cx="7.6" cy="4" rx="1.5" ry="2.1" />
      <ellipse cx="11.1" cy="5.1" rx="1.5" ry="2" />
      <path d="M7.7 7.6c2.3 0 4.1 1.5 4.1 3.2 0 1.4-1.1 2.2-2.5 2.2-.7 0-1.1-.2-1.6-.2s-.9.2-1.6.2c-1.4 0-2.5-.8-2.5-2.2 0-1.7 1.8-3.2 4.1-3.2Z" />
    </svg>
  )
}

type PetPickerProps = {
  choice: Choice
  onChange: (choice: Choice) => void
}

function PetPicker({ choice, onChange }: PetPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="pet-picker" ref={rootRef}>
      <button
        className="pet-picker-trigger"
        type="button"
        aria-expanded={open}
        aria-label="小宠物设置"
        title="小宠物"
        onClick={() => setOpen((value) => !value)}
      >
        <PawIcon />
      </button>

      {open ? (
        <div className="pet-menu" role="radiogroup" aria-label="选择小宠物">
          {PET_LIST.map((pet) => (
            <button
              className="pet-menu-item"
              key={pet.id}
              type="button"
              role="radio"
              aria-checked={choice === pet.id}
              onClick={() => {
                onChange(pet.id)
                setOpen(false)
              }}
            >
              <span className="pet-menu-art">
                <PetSprite pet={pet} behavior="idle" scale={2} />
              </span>
              <span className="pet-menu-text">
                <span className="pet-menu-name">{pet.name}</span>
                <span className="pet-menu-hint">{pet.hint}</span>
              </span>
            </button>
          ))}

          <button
            className="pet-menu-item pet-menu-off"
            type="button"
            role="radio"
            aria-checked={choice === 'off'}
            onClick={() => {
              onChange('off')
              setOpen(false)
            }}
          >
            <span className="pet-menu-art" aria-hidden="true">
              —
            </span>
            <span className="pet-menu-text">
              <span className="pet-menu-name">不显示</span>
              <span className="pet-menu-hint">安静地写字</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

type PetCompanionProps = {
  /** 正在等模型回答 */
  busy?: boolean
}

export function PetCompanion({ busy = false }: PetCompanionProps) {
  const [choice, setChoice] = useState<Choice>(readChoice)

  const change = useCallback((next: Choice) => {
    setChoice(next)
    writeChoice(next)
  }, [])

  return (
    <div className="pet-bar">
      {choice === 'off' ? null : <PetActor petId={choice} busy={busy} />}
      <PetPicker choice={choice} onChange={change} />
    </div>
  )
}
