import type { Crawl } from './types'

/**
 * A crawl is a reason to walk, not a shortest path. Each one is a half-day
 * with an argument behind it; the map draws it as an inked dotted line.
 */
export const CRAWLS: Crawl[] = [
  {
    id: 'plane-trees',
    name: 'Under the Plane Trees',
    nameZh: '梧桐树下',
    subtitle: 'Wukang → Anfu → Wuyuan · 2.1 km',
    blurb:
      'The postcard walk, done in the right order: espresso standing on Wukang Rd before the crowds, courtyard light at Ferguson Lane, then the slow half of Anfu Rd once the brunch queue has burned off.',
    startHour: 8.5,
    stops: [
      { cafeId: 'drops-wukang', order: 'Standing espresso, 8:30, no queue yet.' },
      { cafeId: 'arabica-ferguson', order: 'Courtyard latte while the sun is still low.' },
      { cafeId: 'lgmy-wuyuan', order: 'Filter, and whatever is on the walls.' },
      { cafeId: 'rac-anfu', order: 'Pavement table, galette, stay an hour.' },
      { cafeId: 'cafe-1984', order: 'Finish behind the gate with a book.' },
    ],
  },
  {
    id: 'nine-square-metres',
    name: 'Nine Square Metres',
    nameZh: '九平米',
    subtitle: 'Standing-room bars only · 2.6 km',
    blurb:
      'Shanghai invented the tiny coffee bar and still does it best. Five shops with no chairs, no wifi and no interest in your laptop — drink it at the window and keep walking.',
    startHour: 8,
    stops: [
      { cafeId: 'manner-nanyang', order: 'Y15 latte at the original two-square-metre window.' },
      { cafeId: 'fumi-coffee', order: 'Cortado on Fumin Rd, three stools.' },
      { cafeId: 'wakewake', order: 'Double shot, thirty seconds.' },
      { cafeId: 'clickii', order: 'Whatever is fastest.' },
      { cafeId: 'm3-yongkang', order: 'End on Yongkang with the after-work queue.' },
    ],
  },
  {
    id: 'roasters-row',
    name: "Roasters' Row",
    nameZh: '烘豆之路',
    subtitle: 'For people who ask about the washing station · 3.4 km',
    blurb:
      'Six rooms where somebody roasts on site and will tell you far more than you asked. Bring an empty bag and a tolerance for opinions about Ethiopian naturals.',
    startHour: 9.5,
    stops: [
      { cafeId: 'bigger-than-bigger', order: 'Start at the bean library. Ask what is new.' },
      { cafeId: 'single-origin-jiaozhou', order: 'One Ethiopian, black.' },
      { cafeId: 'moon-coffee', order: 'Roaster choice, down the alley.' },
      { cafeId: 'radar-sinan', order: 'Competition beans at neighbourhood prices.' },
      { cafeId: 'captain-george', order: 'Finish with the expensive one. You have earned it.' },
    ],
  },
  {
    id: 'deep-work',
    name: 'The Deep Work Circuit',
    nameZh: '专注动线',
    subtitle: 'Plugs, quiet, and nobody hovering · 3.0 km',
    blurb:
      'A full working day split across four rooms so you never overstay a welcome: morning focus, a walking break at noon, an afternoon of tables, and somewhere to read when your brain gives out.',
    startHour: 8,
    stops: [
      { cafeId: 'page-coffee', order: 'First three hours. Corner table, refill drip.' },
      { cafeId: 'aunn-cafe', order: 'Lunch shift, wide tables.' },
      { cafeId: 'graze-changle', order: 'Afternoon session, plugs along the wall.' },
      { cafeId: 'art-gallery-cafe', order: 'Stop working. Read something.' },
    ],
  },
  {
    id: 'water-line',
    name: 'The Water Line',
    nameZh: '沿水而行',
    subtitle: 'Suzhou Creek to the Bund · 4.2 km',
    blurb:
      'Follow the creek east until it hits the river. Warehouses, galleries, then the skyline — the only crawl on this map where the view keeps changing faster than the coffee.',
    startHour: 9.5,
    stops: [
      { cafeId: 'brownie-project', order: 'Brownie in the mill yard.' },
      { cafeId: 'stable-m50', order: 'Espresso between galleries.' },
      { cafeId: 'blue-bottle-creek', order: 'Drip in the brick warehouse.' },
      { cafeId: 'the-lounge-guangfu', order: 'Window seat, watch the barges.' },
      { cafeId: 'horiguchi-yuanmingyuan', order: 'Hand drip in silence.' },
      { cafeId: 'arabica-bund', order: 'Take it to the railing.' },
    ],
  },
  {
    id: 'lane-houses',
    name: 'Lane House Hours',
    nameZh: '弄堂里的下午',
    subtitle: 'Old rooms, slow cups · 2.4 km',
    blurb:
      'Five cafés inside buildings that were something else first — a reading room, a villa, a courtyard house. Sit down, put the phone away, and let the afternoon go.',
    startHour: 13,
    stops: [
      { cafeId: 'soeng-lok', order: 'Pour-over on hundred-year-old floors.' },
      { cafeId: 'plusone-julu', order: 'Upstairs window on Julu Rd.' },
      { cafeId: 'metal-hands-nanchang', order: 'Courtyard, pistachio latte.' },
      { cafeId: 'cafe-chez-w', order: 'The quiet curve of Xiangshan Rd.' },
      { cafeId: 'old-china-hand', order: 'Finish among the books on Shaoxing Rd.' },
    ],
  },
  {
    id: 'weird-science',
    name: 'Weird Science',
    nameZh: '风味实验',
    subtitle: 'For people bored of flat whites · 2.8 km',
    blurb:
      'Fermentation experiments, nitro, coffee that arrives in a cocktail glass. Nothing here tastes like coffee is supposed to, which is the entire point.',
    startHour: 11,
    stops: [
      { cafeId: 'akimbo-lab', order: 'Whatever the fermentation experiment is.' },
      { cafeId: 'phenomenal', order: 'The signature you cannot pronounce.' },
      { cafeId: 'ops-taiyuan', order: 'Standing, seasonal, strange.' },
      { cafeId: 'hexagon-urumqi', order: 'Espresso tonic as the light goes.' },
      { cafeId: 'apollo-anfu', order: 'The handover from coffee to negroni.' },
    ],
  },
]
