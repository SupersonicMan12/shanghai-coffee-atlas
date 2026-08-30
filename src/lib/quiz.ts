import type { Axes } from '../data/types'

export interface QuizOption {
  id: string
  label: string
  labelZh: string
  axes: Partial<Axes>
}

export interface QuizQuestion {
  id: string
  prompt: string
  promptZh: string
  options: QuizOption[]
}

/**
 * Six questions about how you actually behave in a café, not about which beans
 * you claim to prefer. The answers move the compass; the compass moves the map.
 */
export const QUIZ: QuizQuestion[] = [
  {
    id: 'arrive',
    prompt: 'You walk in. Every table is taken except one, next to a very loud phone call.',
    promptZh: '你走进店里，只剩下一个座位，旁边有人在大声打电话。',
    options: [
      {
        id: 'leave',
        label: 'I leave. Immediately.',
        labelZh: '立刻走人。',
        axes: { energy: 12, focus: 82, linger: 70 },
      },
      {
        id: 'headphones',
        label: 'Headphones on, problem solved.',
        labelZh: '戴上耳机就好。',
        axes: { energy: 55, focus: 78, linger: 72 },
      },
      {
        id: 'standing',
        label: 'I was never sitting down anyway.',
        labelZh: '我本来就没打算坐。',
        axes: { energy: 62, focus: 20, linger: 12 },
      },
      {
        id: 'eavesdrop',
        label: 'Honestly? I want to hear how it ends.',
        labelZh: '说实话，我想听完这通电话。',
        axes: { energy: 85, focus: 22, linger: 60 },
      },
    ],
  },
  {
    id: 'order',
    prompt: 'The barista asks what you feel like.',
    promptZh: '咖啡师问你想喝什么。',
    options: [
      {
        id: 'flatwhite',
        label: 'Flat white. The same one I always have.',
        labelZh: '馥芮白，还是老样子。',
        axes: { adventure: 15, spend: 32 },
      },
      {
        id: 'filter',
        label: 'What is on filter today?',
        labelZh: '今天有什么手冲？',
        axes: { adventure: 68, spend: 58 },
      },
      {
        id: 'weird',
        label: 'Whatever is strangest on the board.',
        labelZh: '菜单上最奇怪的那个。',
        axes: { adventure: 95, spend: 72 },
      },
      {
        id: 'notcoffee',
        label: 'Is the matcha any good?',
        labelZh: '抹茶好喝吗？',
        axes: { adventure: 52, spend: 48, energy: 62 },
      },
    ],
  },
  {
    id: 'laptop',
    prompt: 'The laptop question.',
    promptZh: '关于笔记本电脑。',
    options: [
      {
        id: 'always',
        label: "It's open before the coffee arrives.",
        labelZh: '咖啡还没来，电脑已经打开了。',
        axes: { focus: 92, linger: 88, energy: 34 },
      },
      {
        id: 'sometimes',
        label: 'Only if the table is big enough.',
        labelZh: '桌子够大才拿出来。',
        axes: { focus: 62, linger: 65 },
      },
      {
        id: 'never',
        label: 'I came here to look out of the window.',
        labelZh: '我是来看窗外的。',
        axes: { focus: 18, linger: 62, energy: 44 },
      },
      {
        id: 'hostile',
        label: 'Laptops in cafés should be illegal.',
        labelZh: '咖啡馆里不该有电脑。',
        axes: { focus: 8, linger: 30, energy: 70 },
      },
    ],
  },
  {
    id: 'walk',
    prompt: 'How far will you walk for a better cup?',
    promptZh: '为了一杯更好的咖啡，你愿意走多远？',
    options: [
      {
        id: 'nearest',
        label: 'The nearest decent one wins.',
        labelZh: '最近的那家就行。',
        axes: { adventure: 18, spend: 25 },
      },
      {
        id: 'fifteen',
        label: 'Fifteen minutes, under the plane trees.',
        labelZh: '十五分钟，走梧桐树下。',
        axes: { adventure: 55, linger: 60 },
      },
      {
        id: 'crossriver',
        label: "I've crossed the river for a single origin.",
        labelZh: '为了一支单品我过过江。',
        axes: { adventure: 92, spend: 70, focus: 42 },
      },
    ],
  },
  {
    id: 'money',
    prompt: 'A cup costs ¥68.',
    promptZh: '一杯咖啡要68元。',
    options: [
      {
        id: 'no',
        label: 'Absolutely not. Manner is ¥15.',
        labelZh: '不可能，Manner才15块。',
        axes: { spend: 8, adventure: 30, linger: 25 },
      },
      {
        id: 'once',
        label: 'Once, if someone can explain why.',
        labelZh: '如果有人能说清楚为什么，可以试一次。',
        axes: { spend: 58, adventure: 72 },
      },
      {
        id: 'yes',
        label: 'Sold. Where do I sit?',
        labelZh: '买了，坐哪儿？',
        axes: { spend: 92, adventure: 80, linger: 72 },
      },
    ],
  },
  {
    id: 'room',
    prompt: 'The room you want to be in.',
    promptZh: '你想待的那个房间。',
    options: [
      {
        id: 'courtyard',
        label: 'A courtyard with old bricks and one tree.',
        labelZh: '有老砖墙和一棵树的院子。',
        axes: { energy: 38, linger: 88, focus: 40 },
      },
      {
        id: 'window',
        label: 'A steel counter facing the street.',
        labelZh: '面向街道的金属吧台。',
        axes: { energy: 65, linger: 20, focus: 30 },
      },
      {
        id: 'quiet',
        label: 'A wooden room where nobody speaks.',
        labelZh: '没人说话的木头房间。',
        axes: { energy: 10, linger: 78, focus: 76 },
      },
      {
        id: 'busy',
        label: 'Somewhere full of people I might know.',
        labelZh: '人多、说不定能碰到熟人的地方。',
        axes: { energy: 92, linger: 66, focus: 22 },
      },
    ],
  },
]

export interface Character {
  id: string
  name: string
  nameZh: string
  line: string
}

/** Named results, chosen by which corner of the compass you land in. */
export const CHARACTERS: Character[] = [
  {
    id: 'standing-drinker',
    name: 'The Standing Drinker',
    nameZh: '站着喝的人',
    line: 'In and out in four minutes. You measure a city in espresso, not in seats.',
  },
  {
    id: 'lane-dweller',
    name: 'The Lane Dweller',
    nameZh: '弄堂常客',
    line: 'You want old bricks, a slow afternoon and nobody asking if you are finished.',
  },
  {
    id: 'deep-worker',
    name: 'The Deep Worker',
    nameZh: '长桌工作者',
    line: 'A plug, a wide table and the same corner three days a week. You tip well for it.',
  },
  {
    id: 'flavour-chaser',
    name: 'The Flavour Chaser',
    nameZh: '风味猎人',
    line: 'You cross the river for a lot. Anaerobic naturals, cascara tonics, whatever is next.',
  },
  {
    id: 'social-animal',
    name: 'The Social Animal',
    nameZh: '社交动物',
    line: 'Coffee is the excuse. You want the loud room and the pavement table.',
  },
  {
    id: 'quiet-reader',
    name: 'The Quiet Reader',
    nameZh: '安静读者',
    line: 'One filter, one book, two hours. Please do not play music.',
  },
  {
    id: 'value-hunter',
    name: 'The Value Hunter',
    nameZh: '性价比之王',
    line: 'You know exactly which fifteen-kuai window pulls a better shot than the tourist bars.',
  },
]

export function characterFor(axes: Axes): Character {
  const { focus, energy, linger, adventure, spend } = axes
  if (linger < 32 && spend < 45) return CHARACTERS[0]
  if (spend < 30) return CHARACTERS[6]
  if (adventure > 72) return CHARACTERS[3]
  if (focus > 70) return CHARACTERS[2]
  if (energy > 72) return CHARACTERS[4]
  if (energy < 34 && focus < 60) return CHARACTERS[5]
  return CHARACTERS[1]
}

/** Average the answered options; unanswered axes stay in the middle. */
export function axesFromAnswers(answers: Record<string, string>): Axes {
  const sums: Record<keyof Axes, number[]> = {
    focus: [],
    energy: [],
    linger: [],
    adventure: [],
    spend: [],
  }
  for (const q of QUIZ) {
    const chosen = answers[q.id]
    if (!chosen) continue
    const opt = q.options.find((o) => o.id === chosen)
    if (!opt) continue
    for (const [k, v] of Object.entries(opt.axes) as [keyof Axes, number][]) {
      sums[k].push(v)
    }
  }
  const out = {} as Axes
  for (const key of Object.keys(sums) as (keyof Axes)[]) {
    const vals = sums[key]
    out[key] = vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 50
  }
  return out
}
