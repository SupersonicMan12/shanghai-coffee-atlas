/**
 * The metro stations that fall on the sheet. Geolocation is unreliable indoors
 * and half of Shanghai navigates by station name anyway, so every station
 * inside the atlas bbox can serve as an anchor for "near me" ranking.
 *
 * Coordinates are the station centroids from OpenStreetMap (ODbL). Lines are
 * limited to the ones that actually cross the sheet:
 * 1/2/3/4/6/7/8/9/10/11/12/13/14/15/16/18.
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
  6: '#d9027d',
  7: '#ff6900',
  8: '#00a3e0',
  9: '#71c5e8',
  10: '#c1a7e2',
  11: '#871c2b',
  12: '#007b5f',
  13: '#ef95cf',
  14: '#827a04',
  15: '#cab48f',
  16: '#32d2c9',
  18: '#c4984f',
}

export const METRO_LINES = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18]

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
  // Wider-sheet additions (coverage expansion): stations OSM places on the
  // enlarged bbox, lines from the subway route relations.
  { id: 'zhongshan-rd-n', name: 'North Zhongshan Road', nameZh: '中山北路', lines: [1], lng: 121.45447, lat: 31.26149 },
  { id: 'caobao-rd', name: 'Caobao Road', nameZh: '漕宝路', lines: [1, 12], lng: 121.42911, lat: 31.17043 },
  { id: 'site-of-the-first-cpc-national-congress-huangpi-rd', name: 'Site of the First CPC National Congress·South Huangpi Road', nameZh: '一大会址·黄陂南路', lines: [1, 14], lng: 121.46865, lat: 31.22529 },
  { id: 'shanghai-science-technology-museum', name: 'Shanghai Science & Technology Museum', nameZh: '上海科技馆', lines: [2], lng: 121.53866, lat: 31.22189 },
  { id: 'century-ave', name: 'Century Avenue', nameZh: '世纪大道', lines: [2, 4, 6, 9], lng: 121.52272, lat: 31.2308 },
  { id: 'longyang-rd', name: 'Longyang Road', nameZh: '龙阳路', lines: [2, 7, 16, 18], lng: 121.55322, lat: 31.20453 },
  { id: 'longcao-rd', name: 'Longcao Road', nameZh: '龙漕路', lines: [3, 12], lng: 121.43895, lat: 31.17207 },
  { id: 'linyi-xincun', name: 'Linyi Xincun', nameZh: '临沂新村', lines: [6], lng: 121.51316, lat: 31.1958 },
  { id: 'shanghai-children-s-medical-center', name: 'Shanghai Children\'s Medical Center', nameZh: '上海儿童医学中心', lines: [6], lng: 121.51955, lat: 31.20615 },
  { id: 'yuanshen-sports-centre', name: 'Yuanshen Sports Centre', nameZh: '源深体育中心', lines: [6], lng: 121.5299, lat: 31.23504 },
  { id: 'beiyangjing-rd', name: 'Beiyangjing Road', nameZh: '北洋泾路', lines: [6], lng: 121.5478, lat: 31.24117 },
  { id: 'dongming-rd', name: 'Dongming Road', nameZh: '东明路', lines: [6, 13], lng: 121.50658, lat: 31.1748 },
  { id: 'minsheng-rd', name: 'Minsheng Road', nameZh: '民生路', lines: [6, 18], lng: 121.54042, lat: 31.23768 },
  { id: 'yangsi', name: 'Yangsi', nameZh: '杨思', lines: [8], lng: 121.48901, lat: 31.16302 },
  { id: 'xizang-rd-n', name: 'North Xizang Road', nameZh: '西藏北路', lines: [8], lng: 121.46457, lat: 31.26557 },
  { id: 'quyang-rd', name: 'Quyang Road', nameZh: '曲阳路', lines: [8], lng: 121.48579, lat: 31.27854 },
  { id: 'anshan-xincun', name: 'Anshan Xincun', nameZh: '鞍山新村', lines: [8], lng: 121.50517, lat: 31.27526 },
  { id: 'huangxing-rd', name: 'Huangxing Road', nameZh: '黄兴路', lines: [8], lng: 121.5241, lat: 31.28095 },
  { id: 'siping-rd', name: 'Siping Road', nameZh: '四平路', lines: [8, 10], lng: 121.49707, lat: 31.27686 },
  { id: 'chengshan-rd', name: 'Chengshan Road', nameZh: '成山路', lines: [8, 13], lng: 121.49178, lat: 31.17276 },
  { id: 'jiangpu-rd', name: 'Jiangpu Road', nameZh: '江浦路', lines: [8, 18], lng: 121.51435, lat: 31.27653 },
  { id: 'fangdian-rd', name: 'Fangdian Road', nameZh: '芳甸路', lines: [9], lng: 121.55442, lat: 31.2344 },
  { id: 'yili-rd', name: 'Yili Road', nameZh: '伊犁路', lines: [10], lng: 121.39803, lat: 31.20111 },
  { id: 'songyuan-rd', name: 'Songyuan Road', nameZh: '宋园路', lines: [10], lng: 121.4079, lat: 31.19834 },
  { id: 'youdian-xincun', name: 'Youdian Xincun', nameZh: '邮电新村', lines: [10], lng: 121.48981, lat: 31.27041 },
  { id: 'tongji-university', name: 'Tongji University', nameZh: '同济大学', lines: [10], lng: 121.50206, lat: 31.28442 },
  { id: 'site-of-the-first-cpc-national-congress-xintiandi', name: 'Site of the First CPC National Congress·Xintiandi', nameZh: '一大会址·新天地', lines: [10, 13], lng: 121.46988, lat: 31.21802 },
  { id: 'fengqiao-rd', name: 'Fengqiao Road', nameZh: '枫桥路', lines: [11], lng: 121.40572, lat: 31.24434 },
  { id: 'shanghai-swimming-center', name: 'Shanghai Swimming Center', nameZh: '上海游泳馆', lines: [11], lng: 121.43675, lat: 31.18128 },
  { id: 'yunjin-rd', name: 'Yunjin Road', nameZh: '云锦路', lines: [11], lng: 121.45387, lat: 31.1695 },
  { id: 'longhua', name: 'Longhua', nameZh: '龙华', lines: [11, 12], lng: 121.44843, lat: 31.17575 },
  { id: 'zhenru', name: 'Zhenru', nameZh: '真如', lines: [11, 14], lng: 121.40227, lat: 31.25257 },
  { id: 'hongmei-rd', name: 'Hongmei Road', nameZh: '虹梅路', lines: [12], lng: 121.39269, lat: 31.16224 },
  { id: 'hongcao-rd', name: 'Hongcao Road', nameZh: '虹漕路', lines: [12], lng: 121.40613, lat: 31.16625 },
  { id: 'ningguo-rd', name: 'Ningguo Road', nameZh: '宁国路', lines: [12], lng: 121.5283, lat: 31.27068 },
  { id: 'longchang-rd', name: 'Longchang Road', nameZh: '隆昌路', lines: [12], lng: 121.5407, lat: 31.27763 },
  { id: 'aiguo-rd', name: 'Aiguo Road', nameZh: '爱国路', lines: [12], lng: 121.54828, lat: 31.28198 },
  { id: 'fuxing-island', name: 'Fuxing Island', nameZh: '复兴岛', lines: [12], lng: 121.55696, lat: 31.28302 },
  { id: 'guilin-park', name: 'Guilin Park', nameZh: '桂林公园', lines: [12, 15], lng: 121.41498, lat: 31.16898 },
  { id: 'jiangpu-park', name: 'Jiangpu Park', nameZh: '江浦公园', lines: [12, 18], lng: 121.51921, lat: 31.2669 },
  { id: 'world-expo-museum', name: 'World Expo Museum', nameZh: '世博会博物馆', lines: [13], lng: 121.4771, lat: 31.19924 },
  { id: 'jiangning-rd', name: 'Jiangning Road', nameZh: '江宁路', lines: [13], lng: 121.43986, lat: 31.24611 },
  { id: 'zhongning-rd', name: 'Zhongning Road', nameZh: '中宁路', lines: [14], lng: 121.41002, lat: 31.24691 },
  { id: 'yuanshen-rd', name: 'Yuanshen Road', nameZh: '源深路', lines: [14], lng: 121.5265, lat: 31.24337 },
  { id: 'xiepu-rd', name: 'Xiepu Road', nameZh: '歇浦路', lines: [14], lng: 121.54704, lat: 31.25267 },
  { id: 'longju-rd', name: 'Longju Road', nameZh: '龙居路', lines: [14], lng: 121.5547, lat: 31.25947 },
  { id: 'tongchuan-rd', name: 'Tongchuan Road', nameZh: '铜川路', lines: [14, 15], lng: 121.39229, lat: 31.25258 },
  { id: 'changyi-rd', name: 'Changyi Road', nameZh: '昌邑路', lines: [14, 18], lng: 121.53577, lat: 31.24603 },
  { id: 'danyang-rd', name: 'Danyang Road', nameZh: '丹阳路', lines: [18], lng: 121.52605, lat: 31.25691 },
  { id: 'pingliang-rd', name: 'Pingliang Road', nameZh: '平凉路', lines: [18], lng: 121.52253, lat: 31.26105 },
  { id: 'fangxin-rd', name: 'Fangxin Road', nameZh: '芳芯路', lines: [18], lng: 121.55504, lat: 31.19316 },
  { id: 'yingchun-rd', name: 'Yingchun Road', nameZh: '迎春路', lines: [18], lng: 121.54676, lat: 31.22322 },
  { id: 'fushun-rd', name: 'Fushun Road', nameZh: '抚顺路', lines: [18], lng: 121.51133, lat: 31.28605 },
]

export const STATION_BY_ID = new Map(METRO_STATIONS.map((s) => [s.id, s]))

/** Stations that a given line calls at, in sheet order (west→east by lng). */
export function stationsOnLine(line: number): MetroStation[] {
  return METRO_STATIONS.filter((s) => s.lines.includes(line)).sort((a, b) => a.lng - b.lng)
}
