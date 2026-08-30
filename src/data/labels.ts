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

/* ------------------------------------------------------------------------ */
/* The interface itself, as { en, zh } pairs. Rendered through t()/sub()     */
/* from src/lib/i18n.tsx so the whole atlas can read in either language.    */
/* ------------------------------------------------------------------------ */

export const ARCHETYPE_BLURB_ZH: Record<Archetype, string> = {
  'standing-bar': '两平米，没有椅子，队伍走得很快。',
  'lane-house': '先是一个家，后来才是咖啡馆。',
  roastery: '现场烘豆，而且他们很乐意跟你聊。',
  garden: '室外的桌子、树，和坐一小时的理由。',
  laboratory: '发酵、浸渍，一杯会跟你争论的咖啡。',
  gallery: '墙上有作品，而且真的重要。',
  riverside: '风景包办了一半的体验。',
  neighborhood: '熟客、绿植，有人记得你的口味。',
  bakery: '为甜点而来，因为咖啡也好而留下。',
  'hidden-door': '没有招牌，在楼上，或藏在别的店后面。',
}

export const AXIS_ENDS_ZH: Record<string, { low: string; high: string }> = {
  focus: { low: '来聊天', high: '来办公' },
  energy: { low: '图书馆般安静', high: '热闹喧腾' },
  linger: { low: '喝完就走', high: '坐上几小时' },
  adventure: { low: '经典馥芮白', high: '给我惊喜' },
  spend: { low: '日常价位', high: '值得挥霍' },
}

export const PHASE_LINE_ZH: Record<string, string> = {
  dawn: '面包师和站立吧台。还没有人说话。',
  morning: '意式浓缩的高峰。武康路在排队，笔记本占领了桌子。',
  afternoon: '梧桐树荫，第二杯，漫长的工作时段。',
  dusk: '交接班。咖啡机关了，尼格罗尼推车出来了。',
  night: '几乎都打烊了。还开着的那几家，值得跑一趟。',
}

export const UI = {
  // header
  whereAmI: { en: 'Where am I?', zh: '我在哪里？' },
  methodTitle: { en: 'How the compass is drawn', zh: '方法说明' },
  hourOfDay: { en: 'Hour of the day', zh: '一天中的时刻' },
  shanghaiNow: { en: 'Shanghai, now', zh: '上海此刻' },
  now: { en: 'Now', zh: '现在' },
  searchPlaceholder: { en: 'Find a café by name or street…', zh: '按店名或街道找咖啡馆…' },
  searchNoResults: { en: 'No café by that name on this sheet.', zh: '图上没有找到这家店。' },
  searchLabel: { en: 'Search cafés', zh: '搜索咖啡馆' },

  // tabs & views
  tabCompass: { en: 'Compass', zh: '罗盘' },
  tabCrawls: { en: 'Crawls', zh: '路线' },
  tabPassport: { en: 'Passport', zh: '护照' },
  viewMap: { en: 'Map', zh: '地图' },
  viewList: { en: 'List', zh: '列表' },
  compassSetFor: { en: 'Compass set for', zh: '罗盘已设为' },
  roomsLike: { en: 'rooms like', zh: '像这样的房间：' },

  // geolocation notes
  geoNoShare: { en: 'This browser will not share a location.', zh: '这个浏览器不提供定位。' },
  geoLooking: { en: 'Looking…', zh: '定位中…' },
  geoOutside: {
    en: 'You are outside the sheet. The atlas only covers central Shanghai.',
    zh: '你在图纸之外。这份地图只覆盖上海市中心。',
  },
  geoRefused: {
    en: 'Location refused — no problem, the atlas works without it.',
    zh: '定位被拒绝——没关系，地图照样能用。',
  },

  // map chrome
  zoomIn: { en: 'Zoom in', zh: '放大' },
  zoomOut: { en: 'Zoom out', zh: '缩小' },
  wholeSheet: { en: 'Whole sheet', zh: '整张图' },
  attribution: {
    en: 'Hand-inked from OpenStreetMap geometry (ODbL). Rooms, ratings and opinions are the Atlas’s own.',
    zh: '基于 OpenStreetMap 几何数据手绘（ODbL）。空间、评分与观点均为地图集自己的判断。',
  },
  yourPin: { en: 'Your pin', zh: '你的图钉' },
  you: { en: 'You', zh: '你' },

  // compass panel
  sixQuestions: { en: 'Six questions', zh: '六个问题' },
  quizTitle: { en: 'What kind of drinker are you?', zh: '你是哪种喝咖啡的人？' },
  quizSub: {
    en: 'Answer honestly and the atlas repaints itself around you.',
    zh: '诚实作答，地图会围绕你重新上色。',
  },
  theCompass: { en: 'The compass', zh: '咖啡罗盘' },
  compassNote: {
    en: 'Five spectrums instead of a search box. Drag them to describe the next hour of your life; every café is scored against where you land.',
    zh: '用五条光谱代替搜索框。拖动它们，描述你接下来一小时想要的样子；每家咖啡馆都会按你的落点打分。',
  },
  hardLimits: { en: 'Hard limits', zh: '筛选' },
  orLess: { en: 'or less', zh: '以内' },
  openAt: { en: 'Open at', zh: '营业于' },
  tenKinds: { en: 'Ten kinds of room', zh: '十种空间' },
  cafesMatch: { en: 'cafés match', zh: '家咖啡馆符合' },
  resetEverything: { en: 'Reset everything', zh: '全部重置' },

  // near me
  nearMe: { en: 'Near me', zh: '就在附近' },
  nearMeNote: {
    en: 'Anchor the atlas to a point and the ranking weighs walking time against the compass: a great room nearby beats a perfect one across town.',
    zh: '把地图锚定在一个点上，排序会在步行时间和罗盘之间权衡：近处的好房间胜过城那头的完美房间。',
  },
  useMyLocation: { en: 'Use my location', zh: '用我的位置' },
  dropPin: { en: 'Drop a pin', zh: '丢个图钉' },
  openNow: { en: 'Open now', zh: '现在营业' },
  pinHint: { en: 'Now tap the map where you are standing.', zh: '现在，在地图上点你站的位置。' },
  orAnchorMetro: { en: 'Or anchor to a metro station', zh: '或按地铁站锚定' },
  chooseStation: { en: '— choose a station —', zh: '— 选一站 —' },
  lineWord: { en: 'Line', zh: '线' },
  anchoredAt: { en: 'Anchored at', zh: '锚定于' },
  openAtWord: { en: 'open at', zh: '营业于' },
  clear: { en: 'Clear', zh: '清除' },

  // results strip / list
  nearestThatFit: { en: 'Nearest that fit', zh: '就在附近' },
  closestToCompass: { en: 'Closest to your compass', zh: '最贴近你' },
  everythingOnMap: { en: 'Everything on the map', zh: '全部' },
  stripEmpty: {
    en: 'Nothing matches those hard limits. Loosen one — the compass is a preference, the filters are a wall.',
    zh: '没有符合这些硬性条件的店。放宽一条吧——罗盘是偏好，筛选是墙。',
  },
  closesIn: { en: 'closes in', zh: '还有' },
  minShut: { en: 'min', zh: '分钟打烊' },
  minWord: { en: 'min', zh: '分钟' },
  minWalk: { en: 'min walk', zh: '分钟步行' },

  // café card
  close: { en: 'Close', zh: '关闭' },
  againstCompass: { en: 'against your compass', zh: '相对你的罗盘' },
  hoursWord: { en: 'Hours', zh: '营业时间' },
  seatsWord: { en: 'Seats', zh: '座位' },
  spendWord: { en: 'Spend', zh: '花费' },
  openAtHour: { en: 'open at', zh: '营业于' },
  shutAtHour: { en: 'shut at', zh: '未营业于' },
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
  calibrate: { en: 'Calibrate the compass', zh: '校准罗盘' },
  recalibrate: { en: 'Recalibrate the compass', zh: '重新校准罗盘' },
  calibratedByYou: { en: 'calibrated by you', zh: '你已校准' },
  readingOnFile: { en: 'reading on file', zh: '份读数存档' },
  readingsOnFile: { en: 'readings on file', zh: '份读数存档' },
  calibrateSub: {
    en: 'Five taps, thirty seconds — you were there, we were guessing.',
    zh: '五个问题，三十秒——你去过，我们只是猜。',
  },
  tapAnswerFirst: { en: 'Tap an answer first', zh: '先选一个答案' },
  fileAnswers: { en: 'File', zh: '提交' },
  ofFive: { en: 'of 5', zh: '/5' },
  notNow: { en: 'Not now', zh: '下次再说' },
  withdrawVote: { en: 'Withdraw my vote', zh: '撤回我的投票' },

  // quiz modal
  youAre: { en: 'You are', zh: '你是' },
  repaintMap: { en: 'Repaint the map for me', zh: '为我重绘地图' },
  startAgain: { en: 'Start again', zh: '重新开始' },
  questionWord: { en: 'Question', zh: '第' },
  ofWord: { en: 'of', zh: '题，共' },
  questionTail: { en: '', zh: '题' },
  back: { en: 'Back', zh: '上一题' },
  skipQuiz: { en: 'Skip the quiz', zh: '跳过测试' },

  // passport
  passportNote: {
    en: 'The passport lives in this browser and nowhere else — no account, no server, no one selling your morning routine. Stamp a café from its card and it inks itself onto the map.',
    zh: '护照只存在这个浏览器里——没有账号，没有服务器，没有人售卖你的晨间习惯。在店卡上盖章，它就会印到地图上。',
  },
  ofStamped: { en: 'stamped', zh: '家已盖章' },
  ofBadges: { en: 'badges', zh: '枚徽章' },
  ofWord2: { en: 'of', zh: '/' },
  onTheList: { en: 'on the list', zh: '在清单上' },
  badgesWord: { en: 'Badges', zh: '徽章' },
  savedForLater: { en: 'Saved for later', zh: '待去' },
  yourStamps: { en: 'Your stamps', zh: '已打卡' },
  emptyStamps: {
    en: 'Nothing yet. Pick a café, drink the coffee, then stamp it — the atlas keeps score so you stop going to the same three places.',
    zh: '还没有记录。挑一家店，喝掉那杯咖啡，然后盖章——地图集帮你记账，免得你总去那三家。',
  },
  copyPassport: { en: 'Copy your passport as text', zh: '把护照复制为文字' },
  copied: { en: 'Copied', zh: '已复制' },

  // crawls
  crawlsNote: {
    en: 'Seven arguments for walking. Each crawl is a running order, not a shortest path — the point is which room you are in at which hour. Tap one and the atlas inks the route.',
    zh: '七条值得走的理由。每条路线是一份出场顺序，不是最短路径——重点是几点钟你在哪个房间。点一条，地图就把路线画出来。',
  },
  stopsWord: { en: 'stops', zh: '站' },
  minWalking: { en: 'min walking', zh: '分钟步行' },
  aboutWord: { en: 'about', zh: '约' },
  hourShort: { en: 'h', zh: '小时' },
  startWord: { en: 'start', zh: '开始' },
  stampedWord: { en: 'stamped', zh: '已盖章' },

  // share card modal
  taxiCardImage: { en: 'Taxi card as an image', zh: '出租车卡图片' },
  inkwellDry: { en: 'The inkwell ran dry — try again.', zh: '墨水用完了——再试一次。' },
  inking: { en: 'Inking…', zh: '上墨中…' },
  longPressSave: { en: 'Long-press the image to save', zh: '长按图片保存到相册' },
  saveImage: { en: 'Save image', zh: '保存图片' },

  // onboarding
  obCompassTitle: { en: 'The compass', zh: '咖啡罗盘' },
  obCompassBody: {
    en: 'Five sliders instead of a search box. Drag them to describe the next hour — every café is scored against where you land.',
    zh: '五条滑杆代替搜索框。拖动它们描述接下来一小时——每家店都按你的落点打分。',
  },
  obCalibrateTitle: { en: 'Calibrate it', zh: '校准它' },
  obCalibrateBody: {
    en: 'Been somewhere? Open its card and tap “Calibrate the compass” — reader readings sharpen the whole map.',
    zh: '去过某家店？打开它的卡片，点「校准罗盘」——读者的读数会让整张图更准。',
  },
  obNearTitle: { en: 'Near me', zh: '就在附近' },
  obNearBody: {
    en: 'Standing on a street? Anchor the atlas to your location, a dropped pin or a metro station and nearby rooms rank first.',
    zh: '正站在街上？把地图锚定到你的位置、一个图钉或一个地铁站，附近的好店会排在最前。',
  },
  obNext: { en: 'Next', zh: '下一步' },
  obDone: { en: 'Start exploring', zh: '开始探索' },
  obSkip: { en: 'Skip', zh: '跳过' },
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
