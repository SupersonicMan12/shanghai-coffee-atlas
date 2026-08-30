import type { Archetype, District, Tag } from './types'

export const DISTRICTS: District[] = [
  'Xuhui',
  "Jing'an",
  'Huangpu',
  'Changning',
  'Putuo',
  'Hongkou',
  'Pudong',
]

export const DISTRICT_ZH: Record<District, string> = {
  Xuhui: '徐汇',
  "Jing'an": '静安',
  Huangpu: '黄浦',
  Changning: '长宁',
  Putuo: '普陀',
  Hongkou: '虹口',
  Pudong: '浦东',
}

export const TAG_LABEL: Record<Tag, string> = {
  'laptop-welcome': 'Laptops welcome',
  'no-laptops': 'No laptops',
  outdoor: 'Outdoor seats',
  'plane-trees': 'Plane trees',
  'standing-only': 'Standing only',
  'own-roast': 'Roasts on site',
  'single-origin': 'Single origin',
  pastry: 'Good pastry',
  view: 'A view',
  late: 'Open late',
  early: 'Early opening',
  'dog-friendly': 'Dog friendly',
  'english-spoken': 'English spoken',
  'cash-free': 'Phone pay only',
  books: 'Books',
  'natural-wine': 'Turns into a bar',
  matcha: 'Matcha too',
  'step-free': 'Step-free entry',
}

export const QUICK_TAGS: Tag[] = [
  'laptop-welcome',
  'outdoor',
  'own-roast',
  'pastry',
  'view',
  'books',
  'late',
  'step-free',
  'no-laptops',
  'matcha',
]

export const ARCHETYPE_LABEL: Record<Archetype, { en: string; zh: string; blurb: string }> = {
  'standing-bar': {
    en: 'Standing bar',
    zh: '站立吧台',
    blurb: 'Two square metres, no chairs, a queue that moves.',
  },
  'lane-house': {
    en: 'Lane house',
    zh: '老洋房 · 弄堂',
    blurb: 'Coffee inside a building that was a home first.',
  },
  roastery: {
    en: 'Roastery',
    zh: '自家烘焙',
    blurb: 'They roast on site and they will tell you about it.',
  },
  garden: {
    en: 'Garden',
    zh: '花园/院子',
    blurb: 'Outdoor tables, trees, the reason to sit for an hour.',
  },
  laboratory: {
    en: 'Laboratory',
    zh: '实验室',
    blurb: 'Fermentation, infusions, coffee that argues with you.',
  },
  gallery: {
    en: 'Gallery',
    zh: '画廊咖啡',
    blurb: 'Art on the walls, and it is actually the point.',
  },
  riverside: {
    en: 'Waterside',
    zh: '临水',
    blurb: 'The view does half the work.',
  },
  neighborhood: {
    en: 'Neighbourhood',
    zh: '街坊店',
    blurb: 'Regulars, plants, someone knows your order.',
  },
  bakery: {
    en: 'Bakery',
    zh: '烘焙坊',
    blurb: 'Come for the pastry, stay because the coffee is good too.',
  },
  'hidden-door': {
    en: 'Hidden door',
    zh: '隐藏入口',
    blurb: 'Unmarked, upstairs, or behind something else.',
  },
}

export const ARCHETYPE_ORDER: Archetype[] = [
  'standing-bar',
  'lane-house',
  'roastery',
  'garden',
  'laboratory',
  'gallery',
  'riverside',
  'neighborhood',
  'bakery',
  'hidden-door',
]
