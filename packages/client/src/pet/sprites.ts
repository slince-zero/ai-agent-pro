/**
 * 像素小宠物的精灵数据
 *
 * 每只宠物是一张 10×9 的字符网格，一个字符就是一个像素：
 *
 * - `.` 透明   `b` 主色   `d` 暗部（脚掌、闭眼、投影）
 * - `l` 亮部（肚皮、口鼻）   `k` 眼睛   `a` 点缀色（喙、鼻头、脚）
 *
 * 为什么不用图片：一只宠物只有几十个像素，走两帧就要两张图，
 * 五只宠物三种状态就是三十个文件；写成字符网格既能直接读懂，
 * 也能在渲染时把同色的连续像素合成一个 `<rect>`，DOM 里只剩十几个节点。
 *
 * **每个行为固定两帧**：切帧只需要改一个 `data-frame` 属性，
 * 由 CSS 决定显示哪一组，动画期间不需要 React 重新渲染。
 */

export type PetId = 'dog' | 'cat' | 'duck' | 'dino' | 'ghost'

export type PetBehavior = 'walk' | 'idle' | 'sleep'

/** 一帧就是九行字符 */
export type PetFrame = readonly string[]

export type PetInk = 'b' | 'd' | 'l' | 'k' | 'a'

export type PetPalette = Record<PetInk, string>

export type PetDef = {
  id: PetId
  name: string
  /** 选择器里的一句话说明 */
  hint: string
  palette: PetPalette
  frames: Record<PetBehavior, readonly [PetFrame, PetFrame]>
  /** 巡游速度，px/s；忙碌时引擎会再加速 */
  speed: number
  /** 漂浮型：不落地，因此不画脚下的影子 */
  float?: boolean
}

/** 柴犬：立耳、粗尾巴，走路时尾巴上下摆 */
const dog: PetDef = {
  id: 'dog',
  name: '柴犬',
  hint: '会小跑，也会坐下来发呆',
  palette: { b: '#c8674a', d: '#a2462b', l: '#f5e4d5', k: '#241f1c', a: '#e79aa6' },
  speed: 26,
  frames: {
    walk: [
      [
        '..bb..bb..',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bllllb..',
        '.bbbbbbbb.',
        'bbbbbbbbb.',
        '.bllllllb.',
        '.b..b..b..',
        '.d..d..d..',
      ],
      [
        '..bb..bb..',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bllllb..',
        'bbbbbbbbb.',
        '.bbbbbbbb.',
        '.bllllllb.',
        '..b..b..b.',
        '..d..d..d.',
      ],
    ],
    idle: [
      [
        '..bb..bb..',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bllllb..',
        '.bbbbbbbb.',
        '.bllllllb.',
        'bbbbbbbbb.',
        '.bbbbbbbb.',
        '.dd..dd...',
      ],
      [
        '..bb..bb..',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bllllb..',
        '.bbbbbbbb.',
        'bbbbbbbbb.',
        '.bllllllb.',
        '.bbbbbbbb.',
        '.dd..dd...',
      ],
    ],
    sleep: [
      [
        '..........',
        '..........',
        '..bb..bb..',
        '..bbbbbb..',
        '..bdbbdb..',
        '.bbbbbbbb.',
        'bbbbbbbbbb',
        '.bllllllb.',
        '.dddddddd.',
      ],
      [
        '..........',
        '..........',
        '..bb..bb..',
        '..bbbbbb..',
        '..bdbbdb..',
        '.bbbbbbbb.',
        'bbbbbbbbbb',
        'bllllllllb',
        '.dddddddd.',
      ],
    ],
  },
}

/** 狸花猫：尖耳朵、竖起来的细尾巴，粉鼻头 */
const cat: PetDef = {
  id: 'cat',
  name: '狸花猫',
  hint: '走得慢，睡得久',
  palette: { b: '#9b948c', d: '#6c665f', l: '#f4efe8', k: '#241f1c', a: '#e79aa6' },
  speed: 20,
  frames: {
    walk: [
      [
        '.b......b.',
        '.bb....bb.',
        '..bbbbbb..',
        '..bkbbkb..',
        '..blaalb..',
        'b.bbbbbbb.',
        'bblllllbb.',
        '.b..b..b..',
        '.d..d..d..',
      ],
      [
        '.b......b.',
        '.bb....bb.',
        '..bbbbbb..',
        '..bkbbkb..',
        'b.blaalb..',
        'b.bbbbbbb.',
        '.bblllllb.',
        '..b..b..b.',
        '..d..d..d.',
      ],
    ],
    idle: [
      [
        '.b......b.',
        '.bb....bb.',
        '..bbbbbb..',
        '..bkbbkb..',
        '..blaalb..',
        '..bbbbbb..',
        '.bbllllbb.',
        '.bbbbbbbb.',
        'bdd..dd...',
      ],
      [
        '.b......b.',
        '.bb....bb.',
        '..bbbbbb..',
        '..bkbbkb..',
        '..blaalb..',
        '..bbbbbb..',
        '.bbllllbb.',
        'bbbbbbbbb.',
        '.dd..dd...',
      ],
    ],
    sleep: [
      [
        '..........',
        '..........',
        '..bb..bb..',
        '..bbbbbb..',
        '..bdbbdb..',
        '.bbbbbbbb.',
        'bbbbbbbbbb',
        '.bllllllb.',
        '.dddddddd.',
      ],
      [
        '..........',
        '..........',
        '..bb..bb..',
        '..bbbbbb..',
        '..bdbbdb..',
        '.bbbbbbbb.',
        'bbbbbbbbbb',
        'bllllllllb',
        '.dddddddd.',
      ],
    ],
  },
}

/** 小黄鸭：橙色喙和脚掌，走起来两只脚一前一后 */
const duck: PetDef = {
  id: 'duck',
  name: '小黄鸭',
  hint: '走路最快，蹲下来像颗蛋',
  palette: { b: '#f0c04a', d: '#cf9a26', l: '#fdf3d4', k: '#241f1c', a: '#ef7a3d' },
  speed: 34,
  frames: {
    walk: [
      [
        '...bbbb...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbaabb..',
        '.bbbbbbbb.',
        'bbbbbbbbb.',
        '.bllllllb.',
        '...a..a...',
        '...aa.aa..',
      ],
      [
        '...bbbb...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbaabb..',
        'bbbbbbbbb.',
        '.bbbbbbbb.',
        '.bllllllb.',
        '..a....a..',
        '.aa....aa.',
      ],
    ],
    idle: [
      [
        '...bbbb...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbaabb..',
        '.bbbbbbbb.',
        '.bllllllb.',
        'bbbbbbbbb.',
        '.bbbbbbbb.',
        '..aa..aa..',
      ],
      [
        '...bbbb...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbaabb..',
        '.bbbbbbbb.',
        'bbbbbbbbb.',
        '.bllllllb.',
        '.bbbbbbbb.',
        '..aa..aa..',
      ],
    ],
    sleep: [
      [
        '..........',
        '..........',
        '...bbbb...',
        '..bbbbbb..',
        '..bdbbdb..',
        '..bbaabb..',
        '.bbbbbbbb.',
        'bllllllllb',
        '.dddddddd.',
      ],
      [
        '..........',
        '..........',
        '...bbbb...',
        '..bbbbbb..',
        '..bdbbdb..',
        '..bbaabb..',
        'bbbbbbbbbb',
        'bllllllllb',
        '.dddddddd.',
      ],
    ],
  },
}

/** 小恐龙：头顶三根刺、粗尾巴，站着时会一上一下地呼吸 */
const dino: PetDef = {
  id: 'dino',
  name: '小恐龙',
  hint: '两条腿踩得很重',
  palette: { b: '#6fa35c', d: '#4a7a3c', l: '#dcecc9', k: '#241f1c', a: '#f0c04a' },
  speed: 24,
  frames: {
    walk: [
      [
        '..b.b.b...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbllbb..',
        'bbbbbbbbb.',
        'bbbbbbbbb.',
        '.bllllllb.',
        '.bb.bb....',
        '.dd.dd....',
      ],
      [
        '..b.b.b...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbllbb..',
        'bbbbbbbbb.',
        'bbbbbbbbb.',
        '.bllllllb.',
        '..bb.bb...',
        '..dd.dd...',
      ],
    ],
    idle: [
      [
        '..........',
        '..b.b.b...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbllbb..',
        'bbbbbbbbb.',
        '.bllllllb.',
        '.bb.bb....',
        '.dd.dd....',
      ],
      [
        '..b.b.b...',
        '..bbbbbb..',
        '..bkbbkb..',
        '..bbllbb..',
        'bbbbbbbbb.',
        'bbbbbbbbb.',
        '.bllllllb.',
        '.bb.bb....',
        '.dd.dd....',
      ],
    ],
    sleep: [
      [
        '..........',
        '..........',
        '..b.b.b...',
        '..bbbbbb..',
        '..bdbbdb..',
        '.bbbbbbbb.',
        'bbbbbbbbbb',
        '.bllllllb.',
        '.dddddddd.',
      ],
      [
        '..........',
        '..........',
        '..b.b.b...',
        '..bbbbbb..',
        '..bdbbdb..',
        '.bbbbbbbb.',
        'bbbbbbbbbb',
        'bllllllllb',
        '.dddddddd.',
      ],
    ],
  },
}

/** 小幽灵：没有腿，下摆自己在波动，靠 CSS 的上下浮动代替走路 */
const ghost: PetDef = {
  id: 'ghost',
  name: '小幽灵',
  hint: '飘着走，脚下没有影子',
  palette: { b: '#e7e4f2', d: '#b4afd0', l: '#ffffff', k: '#3a3550', a: '#e79aa6' },
  speed: 18,
  float: true,
  frames: {
    walk: [
      [
        '...bbbb...',
        '..bbbbbb..',
        '.bbbbbbbb.',
        '.bkbbbbkb.',
        '.bbbbbbbb.',
        '.baabbaab.',
        '.bbbbbbbb.',
        '.bb.bb.bb.',
        '..........',
      ],
      [
        '..........',
        '...bbbb...',
        '..bbbbbb..',
        '.bkbbbbkb.',
        '.bbbbbbbb.',
        '.baabbaab.',
        '.bbbbbbbb.',
        '.bbbbbbbb.',
        '..b..b..b.',
      ],
    ],
    idle: [
      [
        '...bbbb...',
        '..bbbbbb..',
        '.bbbbbbbb.',
        '.bkbbbbkb.',
        '.bbbbbbbb.',
        '.baabbaab.',
        '.bbbbbbbb.',
        '.bb.bb.bb.',
        '..........',
      ],
      [
        '...bbbb...',
        '..bbbbbb..',
        '.bbbbbbbb.',
        '.bdbbbbdb.',
        '.bbbbbbbb.',
        '.baabbaab.',
        '.bbbbbbbb.',
        '.bb.bb.bb.',
        '..........',
      ],
    ],
    sleep: [
      [
        '..........',
        '...bbbb...',
        '..bbbbbb..',
        '.bbbbbbbb.',
        '.bdbbbbdb.',
        '.bbbbbbbb.',
        '.bbbbbbbb.',
        '.bb.bb.bb.',
        '..........',
      ],
      [
        '..........',
        '..........',
        '...bbbb...',
        '..bbbbbb..',
        '.bdbbbbdb.',
        '.bbbbbbbb.',
        '.bbbbbbbb.',
        '.bbbbbbbb.',
        '..b..b..b.',
      ],
    ],
  },
}

export const PET_LIST: readonly PetDef[] = [dog, cat, duck, dino, ghost]

export const PETS: Record<PetId, PetDef> = { dog, cat, duck, dino, ghost }

export function isPetId(value: unknown): value is PetId {
  return typeof value === 'string' && value in PETS
}
