import type { Archetype, District, Tag } from './types'
import type { Pair } from '../lib/i18n'

export const DISTRICTS: District[] = [
  'Xuhui',
  "Jing'an",
  'Huangpu',
  'Changning',
  'Putuo',
  'Hongkou',
  'Pudong',
  'Yangpu',
  'Minhang',
]

export const DISTRICT_ZH: Record<District, string> = {
  Xuhui: '徐汇',
  "Jing'an": '静安',
  Huangpu: '黄浦',
  Changning: '长宁',
  Putuo: '普陀',
  Hongkou: '虹口',
  Pudong: '浦东',
  Yangpu: '杨浦',
  Minhang: '闵行',
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

export const TAG_ZH: Record<Tag, string> = {
  'laptop-welcome': '欢迎办公',
  'no-laptops': '谢绝电脑',
  outdoor: '户外座位',
  'plane-trees': '梧桐树下',
  'standing-only': '仅站立',
  'own-roast': '自家烘焙',
  'single-origin': '单品豆',
  pastry: '甜点出色',
  view: '有风景',
  late: '营业到深夜',
  early: '开门早',
  'dog-friendly': '宠物友好',
  'english-spoken': '可讲英语',
  'cash-free': '仅手机支付',
  books: '有书',
  'natural-wine': '晚上变酒吧',
  matcha: '也有抹茶',
  'step-free': '无台阶入口',
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

export const ARCHETYPE_LABEL: Record<Archetype, { en: string; zh: string }> = {
  'standing-bar': {
    en: 'Standing bar',
    zh: '站立吧台',
  },
  'lane-house': {
    en: 'Lane house',
    zh: '老洋房 · 弄堂',
  },
  roastery: {
    en: 'Roastery',
    zh: '自家烘焙',
  },
  garden: {
    en: 'Garden',
    zh: '花园/院子',
  },
  laboratory: {
    en: 'Laboratory',
    zh: '实验室',
  },
  gallery: {
    en: 'Gallery',
    zh: '画廊咖啡',
  },
  riverside: {
    en: 'Waterside',
    zh: '临水',
  },
  neighborhood: {
    en: 'Neighbourhood',
    zh: '街坊店',
  },
  bakery: {
    en: 'Bakery',
    zh: '烘焙坊',
  },
  'hidden-door': {
    en: 'Hidden door',
    zh: '隐藏入口',
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

/* ------------------------------------------------------------------------ */
/* The interface itself, as { en, zh } pairs. Rendered through t()/sub()     */
/* from src/lib/i18n.tsx so the whole atlas can read in either language.    */
/* ------------------------------------------------------------------------ */

export const AXIS_ENDS_ZH: Record<string, { low: string; high: string }> = {
  focus: { low: '来聊天', high: '来办公' },
  energy: { low: '图书馆般安静', high: '热闹喧腾' },
  linger: { low: '喝完就走', high: '坐上几小时' },
  adventure: { low: '经典馥芮白', high: '给我惊喜' },
  spend: { low: '日常价位', high: '值得挥霍' },
}

export const UI = {
  // header
  methodTitle: { en: 'How this works', zh: '说明' },
  hourOfDay: { en: 'Time of day', zh: '时间' },
  shanghaiNow: { en: 'now', zh: '现在' },
  now: { en: 'Now', zh: '回到现在' },
  openCount: { en: 'open', zh: '家营业中' },
  searchPlaceholder: { en: 'Search café name or street', zh: '搜店名或街道' },
  searchNoResults: { en: 'No café found.', zh: '没有找到这家店。' },
  searchLabel: { en: 'Search cafés', zh: '搜索咖啡馆' },

  // tabs & views
  tabCompass: { en: 'Compass', zh: '罗盘' },
  tabPassport: { en: 'Passport', zh: '护照' },
  viewMap: { en: 'Map', zh: '地图' },
  viewList: { en: 'List', zh: '列表' },
  compassSetFor: { en: 'Showing', zh: '正在显示' },
  roomsLike: { en: 'cafés like', zh: '同款：' },

  // geolocation notes
  geoNoShare: { en: 'This browser cannot share your location. Type a station instead.', zh: '浏览器不支持定位，请输入地铁站。' },
  geoLooking: { en: 'Locating…', zh: '定位中…' },
  geoOutside: {
    en: 'You are outside Shanghai. Type a station instead.',
    zh: '你不在上海范围内，请输入地铁站。',
  },
  geoRefused: {
    en: 'Location blocked. Allow it in the browser, or type a station.',
    zh: '定位被拒绝。请在浏览器允许定位，或输入地铁站。',
  },
  locatedHere: { en: 'Using your location', zh: '已定位到你' },
  youAreHere: { en: 'You are here', zh: '你在这里' },
  startingFrom: { en: 'From', zh: '起点：' },
  otherPlace: { en: 'Somewhere else', zh: '换个地点' },
  stationPlaceholder: { en: 'Type a metro station, e.g. Jing’an Temple', zh: '输入地铁站，如 静安寺' },
  noStation: { en: 'No station by that name.', zh: '没有这个站。' },

  // map chrome
  zoomIn: { en: 'Zoom in', zh: '放大' },
  zoomOut: { en: 'Zoom out', zh: '缩小' },
  wholeSheet: { en: 'Whole sheet', zh: '整张图' },
  attribution: {
    en: 'Map geometry © OpenStreetMap (ODbL). Scores are the Atlas’s own.',
    zh: '地图几何 © OpenStreetMap（ODbL）。评分为地图集自行判断。',
  },
  yourPin: { en: 'Your pin', zh: '你的图钉' },

  // compass panel
  theCompass: { en: 'Fine-tune', zh: '微调' },
  compassNote: {
    en: 'Drag a slider; the recommendations update as you go.',
    zh: '拖动滑杆，推荐会跟着变。',
  },
  hardLimits: { en: 'Filters', zh: '筛选' },
  orLess: { en: 'or less', zh: '以内' },
  cafesMatch: { en: 'cafés open and matching', zh: '家营业中且符合' },
  resetEverything: { en: 'Reset', zh: '重置' },

  // location
  useMyLocation: { en: 'Use my location', zh: '用我的位置' },
  dropPin: { en: 'Or tap a spot on the map', zh: '或在地图上点一个位置' },
  pinHint: { en: 'Tap the map now…', zh: '现在点地图上的位置…' },
  clear: { en: 'Clear', zh: '清除' },

  // results strip / list
  nearestThatFit: { en: 'Nearest that fit', zh: '按步行距离' },
  closestToCompass: { en: 'Closest to your compass', zh: '最贴近你' },
  everythingOnMap: { en: 'Everything on the map', zh: '全部' },
  stripEmpty: {
    en: 'Nothing open matches. Move the time bar or loosen a filter.',
    zh: '没有营业中且符合的店。拖动时间条，或放宽筛选。',
  },
  closesIn: { en: 'closes in', zh: '还有' },
  minShut: { en: 'min', zh: '分钟打烊' },
  minWord: { en: 'min', zh: '分钟' },
  minWalk: { en: 'min walk', zh: '分钟步行' },

  // café card
  close: { en: 'Close', zh: '关闭' },
  againstCompass: { en: 'against your compass', zh: '相对你的罗盘' },
  source: { en: 'source', zh: '来源' },
  hoursWord: { en: 'Hours', zh: '营业时间' },
  seatsWord: { en: 'Seats', zh: '座位' },
  spendWord: { en: 'Spend', zh: '花费' },
  openAtHour: { en: 'open at', zh: '营业于' },
  shutAtHour: { en: 'closed at', zh: '已关门于' },
  seatsNone: { en: 'None — standing', zh: '无座——站立' },
  seatsAbout: { en: 'about', zh: '约' },
  fromYou: { en: 'From you', zh: '距你' },
  fromYourPin: { en: 'From your pin', zh: '距图钉' },
  fromStation: { en: 'From', zh: '距' },
  wellEvidenced: { en: 'well-evidenced', zh: '有据' },
  editorialGuess: { en: 'editorial guess', zh: '编辑判断' },
  stamped: { en: 'Stamped', zh: '已盖章' },
  stampVisited: { en: 'Stamp as visited', zh: '盖章打卡' },
  onYourList: { en: 'On your list', zh: '已在清单' },
  saveForLater: { en: 'Save for later', zh: '存到清单' },
  taxiCard: { en: 'Taxi card', zh: '出租车卡' },
  moreLikeThis: { en: 'More like this', zh: '更多同款' },
  linkCopied: { en: 'Link copied', zh: '链接已复制' },
  share: { en: 'Share', zh: '分享' },
  shareCard: { en: 'Share card', zh: '分享卡片' },
  confidence: { en: 'confidence', zh: '置信度' },

  // calibrate widget
  calibrate: { en: 'Rate this café', zh: '我去过，来打分' },
  recalibrate: { en: 'Change my rating', zh: '修改我的打分' },
  calibratedByYou: { en: 'rated by you', zh: '你已打分' },
  readingOnFile: { en: 'rating so far', zh: '人评过' },
  readingsOnFile: { en: 'ratings so far', zh: '人评过' },
  calibrateSub: {
    en: 'Been here? Five taps make the ranking more accurate.',
    zh: '去过这家？点五下，让排序更准。',
  },
  tapAnswerFirst: { en: 'Tap an answer first', zh: '先选一个答案' },
  fileAnswers: { en: 'File', zh: '提交' },
  ofFive: { en: 'of 5', zh: '/5' },
  notNow: { en: 'Not now', zh: '下次再说' },
  withdrawVote: { en: 'Withdraw my vote', zh: '撤回我的投票' },

  // passport
  passportNote: {
    en: 'Saved and visited cafés. Stored only in this browser, no account needed.',
    zh: '你存下和去过的店。只保存在这个浏览器里，无需账号。',
  },
  ofStamped: { en: 'stamped', zh: '家已盖章' },
  ofBadges: { en: 'badges', zh: '枚徽章' },
  ofWord2: { en: 'of', zh: '/' },
  onTheList: { en: 'on the list', zh: '在清单上' },
  badgesWord: { en: 'Badges', zh: '徽章' },
  savedForLater: { en: 'Saved for later', zh: '待去' },
  yourStamps: { en: 'Your stamps', zh: '已打卡' },
  emptyStamps: {
    en: 'Nothing yet. Open a café and tap “Stamp as visited”.',
    zh: '还没有记录。打开一家店，点「盖章打卡」。',
  },
  copyPassport: { en: 'Copy your passport as text', zh: '把护照复制为文字' },
  copied: { en: 'Copied', zh: '已复制' },

  // share card modal
  taxiCardImage: { en: 'Taxi card as an image', zh: '出租车卡图片' },
  inkwellDry: { en: 'Could not make the image. Try again.', zh: '生成失败，请重试。' },
  inking: { en: 'Making image…', zh: '生成中…' },
  longPressSave: { en: 'Long-press the image to save', zh: '长按图片保存到相册' },
  saveImage: { en: 'Save image', zh: '保存图片' },

  // onboarding
  obScenarioTitle: { en: 'What do you need right now?', zh: '你现在想找什么样的咖啡馆？' },
  obScenarioBody: {
    en: 'Tap one. You get three recommendations and the reason for each.',
    zh: '点一个，马上给你三家推荐和理由。',
  },
  obJustLook: { en: 'Just browse the map', zh: '先看地图' },

  // scenarios & verdicts
  scenariosTitle: { en: 'What do you need?', zh: '你想找什么样的？' },
  scenarioModified: { en: 'tweaked', zh: '已微调' },
  scenarioNowHint: { en: 'suits this hour', zh: '适合此刻' },
  scenarioClear: { en: 'Clear scenario', zh: '取消场景' },
  compassSays: { en: 'Compass says', zh: '罗盘说' },
  pickWord: { en: 'Pick', zh: '首选' },
  estimateMark: { en: 'unverified', zh: '未核实' },
  estimateTitle: {
    en: 'Estimated — no external source has confirmed this café yet.',
    zh: '估算值——尚无外部来源核实这家店。',
  },
  oftenOrdered: { en: 'Often ordered', zh: '他们家常被点的' },
  hardFacts: { en: 'Hard facts', zh: '硬信息' },
  weekHours: { en: 'This week', zh: '本周营业' },
  photosLabel: { en: 'Photos', zh: '照片' },
  sharePicks: { en: 'Share my 3 picks', zh: '分享我的三家首选' },
  myCompassPicks: { en: 'My compass → 3 picks', zh: '我的罗盘 → 三家首选' },
  withinWalk: { en: 'within a 20 min walk', zh: '20 分钟步行内' },
  sheetPeek: { en: 'Show the compass', zh: '展开罗盘' },
  sheetHide: { en: 'Hide the compass', zh: '收起罗盘' },
} satisfies Record<string, Pair>

export const VERDICT_ZH: Record<string, string> = {
  'Made for this': '天造地设',
  'Very close': '非常接近',
  'Good call': '不错的选择',
  'Worth a look': '值得一看',
  'Different mood': '气质不同',
}

export const CLOSENESS_ZH: Record<string, string> = {
  'Right there': '就在眼前',
  'Very close': '非常近',
  'A short walk': '走几步就到',
  'A proper walk': '认真走一段',
  'A trek': '一场跋涉',
}
