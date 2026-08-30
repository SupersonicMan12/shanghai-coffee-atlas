/**
 * The metro stations that fall on the sheet. Geolocation is unreliable indoors
 * and half of Shanghai navigates by station name anyway, so every station
 * inside the atlas bbox can serve as an anchor for "near me" ranking.
 *
 * Coordinates are the station centroids from OpenStreetMap (ODbL). Lines are
 * limited to the ones that actually cross the sheet: 1/2/3/4/7/8/9/10/12/13/14.
 */

export interface MetroStation {
  id: string
  name: string
  nameZh: string
  /** Every atlas-relevant line that calls here, ascending. */
  lines: number[]
  lng: number
  lat: number
}

/** Official Shanghai Metro line liveries, for the picker and the glyph. */
export const LINE_COLOR: Record<number, string> = {
  1: '#e4002b',
  2: '#97d700',
  3: '#ffd100',
  4: '#5f259f',
  7: '#ff6900',
  8: '#00a3e0',
  9: '#71c5e8',
  10: '#c1a7e2',
  12: '#007b5f',
  13: '#ef95cf',
  14: '#827a04',
}

export const METRO_LINES = [1, 2, 3, 4, 7, 8, 9, 10, 12, 13, 14]

export const METRO_STATIONS: MetroStation[] = [
  // Line 1 spine
  { id: 'shanghai-railway', name: 'Shanghai Railway Station', nameZh: '上海火车站', lines: [1, 3, 4], lng: 121.4512, lat: 31.24906 },
  { id: 'hanzhong-rd', name: 'Hanzhong Road', nameZh: '汉中路', lines: [1, 12, 13], lng: 121.45435, lat: 31.24255 },
  { id: 'xinzha-rd', name: 'Xinzha Road', nameZh: '新闸路', lines: [1], lng: 121.46365, lat: 31.24055 },
  { id: 'peoples-square', name: "People's Square", nameZh: '人民广场', lines: [1, 2, 8], lng: 121.47052, lat: 31.23443 },
  { id: 'huangpi-rd-s', name: 'South Huangpi Road', nameZh: '黄陂南路', lines: [1, 14], lng: 121.46935, lat: 31.22493 },
  { id: 'shaanxi-rd-s', name: 'South Shaanxi Road', nameZh: '陕西南路', lines: [1, 10, 12], lng: 121.45469, lat: 31.21779 },
  { id: 'changshu-rd', name: 'Changshu Road', nameZh: '常熟路', lines: [1, 7], lng: 121.44649, lat: 31.21517 },
  { id: 'hengshan-rd', name: 'Hengshan Road', nameZh: '衡山路', lines: [1], lng: 121.44194, lat: 31.20645 },
  { id: 'xujiahui', name: 'Xujiahui', nameZh: '徐家汇', lines: [1, 9], lng: 121.4339, lat: 31.19508 },
  { id: 'indoor-stadium', name: 'Shanghai Indoor Stadium', nameZh: '上海体育馆', lines: [1, 4], lng: 121.43253, lat: 31.18466 },
  // Line 2 east–west
  { id: 'loushanguan-rd', name: 'Loushanguan Road', nameZh: '娄山关路', lines: [2], lng: 121.39676, lat: 31.21337 },
  { id: 'zhongshan-park', name: 'Zhongshan Park', nameZh: '中山公园', lines: [2, 3, 4], lng: 121.41156, lat: 31.22006 },
  { id: 'jiangsu-rd', name: 'Jiangsu Road', nameZh: '江苏路', lines: [2], lng: 121.42625, lat: 31.22154 },
  { id: 'jingan-temple', name: "Jing'an Temple", nameZh: '静安寺', lines: [2, 7, 14], lng: 121.44214, lat: 31.22529 },
  { id: 'nanjing-rd-w', name: 'West Nanjing Road', nameZh: '南京西路', lines: [2, 12, 13], lng: 121.45602, lat: 31.23183 },
  { id: 'nanjing-rd-e', name: 'East Nanjing Road', nameZh: '南京东路', lines: [2, 10], lng: 121.47923, lat: 31.23912 },
  { id: 'lujiazui', name: 'Lujiazui', nameZh: '陆家嘴', lines: [2, 14], lng: 121.49792, lat: 31.23692 },
  // Line 3 / 4 ring
  { id: 'yanan-rd-w', name: "West Yan'an Road", nameZh: '延安西路', lines: [3, 4], lng: 121.41244, lat: 31.21142 },
  { id: 'hongqiao-rd', name: 'Hongqiao Road', nameZh: '虹桥路', lines: [3, 4, 10], lng: 121.4175, lat: 31.19858 },
  { id: 'yishan-rd', name: 'Yishan Road', nameZh: '宜山路', lines: [3, 4, 9], lng: 121.42292, lat: 31.18858 },
  { id: 'jinshajiang-rd', name: 'Jinshajiang Road', nameZh: '金沙江路', lines: [3, 4, 13], lng: 121.40722, lat: 31.23312 },
  { id: 'caoyang-rd', name: 'Caoyang Road', nameZh: '曹杨路', lines: [3, 4, 14], lng: 121.41312, lat: 31.24117 },
  { id: 'zhenping-rd', name: 'Zhenping Road', nameZh: '镇坪路', lines: [3, 4, 7], lng: 121.42516, lat: 31.2482 },
  { id: 'zhongtan-rd', name: 'Zhongtan Road', nameZh: '中潭路', lines: [3, 4], lng: 121.43641, lat: 31.25643 },
  { id: 'baoshan-rd', name: 'Baoshan Road', nameZh: '宝山路', lines: [3, 4], lng: 121.47179, lat: 31.2535 },
  { id: 'hailun-rd', name: 'Hailun Road', nameZh: '海伦路', lines: [4, 10], lng: 121.48506, lat: 31.2609 },
  { id: 'dalian-rd', name: 'Dalian Road', nameZh: '大连路', lines: [4, 12], lng: 121.50839, lat: 31.26017 },
  { id: 'damuqiao-rd', name: 'Damuqiao Road', nameZh: '大木桥路', lines: [4, 12], lng: 121.459, lat: 31.196 },
  { id: 'luban-rd', name: 'Luban Road', nameZh: '鲁班路', lines: [4], lng: 121.47056, lat: 31.20108 },
  { id: 'xizang-rd-s', name: 'South Xizang Road', nameZh: '西藏南路', lines: [4, 8], lng: 121.48511, lat: 31.20361 },
  // Line 7
  { id: 'changping-rd', name: 'Changping Road', nameZh: '昌平路', lines: [7], lng: 121.43815, lat: 31.23546 },
  { id: 'changshou-rd', name: 'Changshou Road', nameZh: '长寿路', lines: [7, 13], lng: 121.43392, lat: 31.24278 },
  { id: 'zhaojiabang-rd', name: 'Zhaojiabang Road', nameZh: '肇嘉浜路', lines: [7, 9], lng: 121.44583, lat: 31.20129 },
  { id: 'dongan-rd', name: "Dong'an Road", nameZh: '东安路', lines: [7, 12], lng: 121.44996, lat: 31.19252 },
  // Line 8
  { id: 'qufu-rd', name: 'Qufu Road', nameZh: '曲阜路', lines: [8, 12], lng: 121.46696, lat: 31.24419 },
  { id: 'zhongxing-rd', name: 'Zhongxing Road', nameZh: '中兴路', lines: [8], lng: 121.46435, lat: 31.25508 },
  { id: 'dashijie', name: 'Dashijie', nameZh: '大世界', lines: [8, 14], lng: 121.47519, lat: 31.22864 },
  { id: 'laoximen', name: 'Laoximen', nameZh: '老西门', lines: [8, 10], lng: 121.47843, lat: 31.22085 },
  { id: 'lujiabang-rd', name: 'Lujiabang Road', nameZh: '陆家浜路', lines: [8, 9], lng: 121.48115, lat: 31.21381 },
  // Line 9
  { id: 'jiashan-rd', name: 'Jiashan Road', nameZh: '嘉善路', lines: [9, 12], lng: 121.4564, lat: 31.20427 },
  { id: 'dapuqiao', name: 'Dapuqiao', nameZh: '打浦桥', lines: [9], lng: 121.46401, lat: 31.20823 },
  { id: 'madang-rd', name: 'Madang Road', nameZh: '马当路', lines: [9, 13], lng: 121.47203, lat: 31.21128 },
  { id: 'xiaonanmen', name: 'Xiaonanmen', nameZh: '小南门', lines: [9], lng: 121.49406, lat: 31.21901 },
  { id: 'shangcheng-rd', name: 'Shangcheng Road', nameZh: '商城路', lines: [9, 14], lng: 121.5125, lat: 31.23254 },
  // Line 10
  { id: 'jiaotong-univ', name: 'Jiao Tong University', nameZh: '交通大学', lines: [10], lng: 121.43046, lat: 31.20404 },
  { id: 'shanghai-library', name: 'Shanghai Library', nameZh: '上海图书馆', lines: [10], lng: 121.43965, lat: 31.21001 },
  { id: 'xintiandi', name: 'Xintiandi', nameZh: '新天地', lines: [10, 13], lng: 121.46982, lat: 31.21794 },
  { id: 'yuyuan', name: 'Yuyuan Garden', nameZh: '豫园', lines: [10, 14], lng: 121.48287, lat: 31.22993 },
  { id: 'tiantong-rd', name: 'Tiantong Road', nameZh: '天潼路', lines: [10, 12], lng: 121.47781, lat: 31.24575 },
  { id: 'sichuan-rd-n', name: 'North Sichuan Road', nameZh: '四川北路', lines: [10], lng: 121.47947, lat: 31.25372 },
  // Line 12 riverside
  { id: 'cruise-terminal', name: 'International Cruise Terminal', nameZh: '国际客运中心', lines: [12], lng: 121.49396, lat: 31.25214 },
  { id: 'tilanqiao', name: 'Tilanqiao', nameZh: '提篮桥', lines: [12], lng: 121.50236, lat: 31.25543 },
  // Line 13
  { id: 'longde-rd', name: 'Longde Road', nameZh: '隆德路', lines: [13], lng: 121.4189, lat: 31.23228 },
  { id: 'wuning-rd', name: 'Wuning Road', nameZh: '武宁路', lines: [13, 14], lng: 121.42649, lat: 31.23477 },
  { id: 'natural-history', name: 'Natural History Museum', nameZh: '自然博物馆', lines: [13], lng: 121.45793, lat: 31.23779 },
  { id: 'huaihai-rd-m', name: 'Middle Huaihai Road', nameZh: '淮海中路', lines: [13], lng: 121.45983, lat: 31.22185 },
  // Line 14
  { id: 'wuding-rd', name: 'Wuding Road', nameZh: '武定路', lines: [14], lng: 121.43176, lat: 31.2289 },
  { id: 'pudong-ave', name: 'Pudong Avenue', nameZh: '浦东大道', lines: [14], lng: 121.51495, lat: 31.24241 },
]

export const STATION_BY_ID = new Map(METRO_STATIONS.map((s) => [s.id, s]))

/** Stations that a given line calls at, in sheet order (west→east by lng). */
export function stationsOnLine(line: number): MetroStation[] {
  return METRO_STATIONS.filter((s) => s.lines.includes(line)).sort((a, b) => a.lng - b.lng)
}
