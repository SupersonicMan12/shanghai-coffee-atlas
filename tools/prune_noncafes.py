#!/usr/bin/env python3
"""Drop records that are not coffee shops from src/data/cafes.ts.

Each id below was reviewed by hand against its Amap category, Amap name/tags
and our own name fields. Reasons are kept next to the id so the list can be
audited. Bakeries and café-bars that lead with coffee are deliberately kept.

Usage:
    python3 tools/prune_noncafes.py          # rewrites cafes.ts, unverified.json, dianping.json
    python3 tools/build_details.py --no-model
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_common import CAFES_TS, ROOT  # noqa: E402

REMOVE: dict[str, str] = {
    # restaurants / bistros / canteens
    'funk-and-kale': 'Amap 中餐厅; salad/brunch restaurant',
    'apollo-anfu': 'Amap 中餐厅; wine bar & restaurant',
    'bar-a-mundi-shangjiazhongxin': '柏兰蒂西餐厅',
    'overlaps-cafe-bistro-hengshan-rd-8': '重合餐厅',
    'sure-yushan-rd-252': '唯尚西餐厅',
    'white-zhixing-rd': '白餐厅 · steak/foie gras',
    'xiaduocanting-fudan': '夏朵餐厅',
    'songguokafeixiuxiancanting-qibaowanke': '休闲餐厅 · 煲仔饭',
    'yazhixukafeicanting-hanghua': '咖啡餐厅',
    'tea-and-coffee-lujiazui': '亚朵餐厅 (hotel restaurant)',
    'niko-and-whole-775-restaurant-and-bar-huaihai755': 'RESTAURANT and BAR',
    'jac-cafe-bistro-tongfeng-rd-699': '杰克食堂',
    'cafe-bistro-changshu-rd-201': '米仓 bistro',
    'demo-huaisanxiaoqu': '和洋食堂',
    'allday-brunch-bistro-yuyuanluzhenning': 'brunch bistro',
    'mrs-bunny-brunch-bistro-binjiang': 'brunch bistro',
    'wvolla-brunch-chuangzhitiandichuangzhifang1qubei': 'brunch',
    'ibarrel-bistro-brunch-qiantangongyuanxiang': 'bistro & brunch',
    's-brunch-bar-changshou-rd': '艾拾牛排酒馆',
    'pine-tree-house-yangzhai-rd': 'Amap 意式菜品餐厅; 鸡肉/意面/牛排',
    'guyuemianbaokafeiriliao-lingling-rd-598-1': 'Amap 日本料理; 炒饭',
    'xiushousi-luwan': '秀寿司',
    'lachaojibanfen-dayangjingdian-tiananqianshu': '辣潮纪拌粉',
    'cafe-xingang-rd-225': '香江铭苑 · 肠粉',
    'chili-s-cafe-bar-binjiang': "Chili's restaurant chain",
    'chili-s-cafe-bar-xinyao-guanghuanlive': "Chili's restaurant chain",
    'chili-s-jiuguangzhongxin': "Chili's restaurant chain",
    'chili-s-xianmengzhongxin1fceng': "Chili's restaurant chain",
    'chili-s-zhangtaiguangchang': "Chili's restaurant chain",
    'burger-king-cafe-osm': 'Burger King',
    # hotel dining rooms
    'bld-tianlin-rd': '万丽酒店咖啡厅 · hotel dining',
    'huayuanfandianmeiguikafeiting-maoming-s-rd': '花园饭店 · buffet/steak/oysters',
    'shanghaidongjinjiangxierdunyilinjiudian-kafeitin': 'Hilton hotel',
    'xijiaobinguankaba-chengjiaqiaojiedaohongqiao-rd-': '西郊宾馆咖吧 · hotel bar',
    'xinghewanjiudiandatangba-jinxiu-rd': '酒店大堂吧 · hotel lobby bar',
    # bars
    'ask-xinjinqiaoguangchang': '問精酿啤酒吧',
    'bell-cafe-bar-tianzifang': '铃铛酒吧',
    'heijiaojiuba-baitiankafei': '黑胶酒吧',
    'moxy-huiyangguangchang': '上海徐汇酒吧',
    'tanyanweishijixuejiajingpinkafeiba-dongzhangzhi-': '威士忌雪茄吧',
    'jenny-s-bar-guinness-donghu-rd-7': 'Guinness bar',
    'the-old-man-and-the-sea-bar-jinhai-rd-18': 'bar',
    'ada-s-bar-yingchun-rd-776': 'bar',
    'yanyangpanba-lingyan-s-rd-181': '岩羊攀吧 · climbing bar',
    # shops, salons, parlours, other venues
    'dongyingzaoxing-huijinbaihuo': '东瀛造型 · hair salon',
    'bk24-tong-n-rd': '光明便利屋 · convenience store',
    'yeeka-mart-dalian-rd-277': '便利集合店',
    'kubrick-qiantantaiguli': '库布里克书店 · bookshop POI',
    'ikea-cafe-yijiajiaju': 'IKEA in-store cafeteria',
    'dukafeiqipai-meichuan-rd': '棋牌 · mahjong parlour',
    'rongkafeiqipairishimajiang-meichuanlubinfensheng': '棋牌日式麻将',
    'huijiazhuoyoujubenkafeiguan-wantiguanqijian': '桌游剧本 · board-game venue',
    'jiuzhimaoxiaojielumaoguanmaomishoumai-mingyuansh': '撸猫馆猫咪售卖 · cat shop',
    'xiangnashengmingnengliangguan-yongrongguojizhong': '生命能量馆',
    'qinglangkafeihuisuo-longshui-s-rd-200': '会所 · private club',
    'longteacoffee-hechuanluyupingjilujiaochakounan18': '茶咖学院 · training academy',
    'chuweichashe-osm': '初未茶社 · tea house',
    'cafe-yunling-east-rd-88': '半马苏河文创空间 · cultural space',
    'mata-mata': 'Amap 糕饼店; tiramisu shop',
    'luneurs-beiwaitanlaifushiguangchang': '法式冰淇淋 · ice-cream/bakery',
    '85-c-bakery-cafe-osm': '85°C bakery chain',
    '85-c-bakery-cafe-osm-2': '85°C bakery chain',
    '85-c-bakery-cafe-osm-3': '85°C bakery chain',
    '85c-bakery-cafe-osm': '85°C bakery chain',
    # no usable identity: both names are just “咖啡/咖啡吧”
    'kafei-shanghaihuiju': 'generic name',
    'kafei-jinganjializhongxin': 'generic name',
    'kafei-caohejingyinxiangcheng': 'generic name',
    'kafei-one-itc': 'generic name',
    'kafei-wanrong-rd-899': 'generic name',
    'kafeiba-shanghaishujudasha': 'generic name',
    'kafeiba-zhongwaiyunshanghaidasha': 'generic name',
    'kafeiba-zhangjiangzhenxuelin-rd-36': 'generic name',
    'kafeiba-dongfang-rd-1881': 'generic name',
    'kafeiba-zhongshannaner-rd-1500': 'generic name',
    'kafeiting-renhenghebinhuayuan': 'generic name',
    'sunnytimes-longdonggaojialuchukouyuzhonghuanluru': 'generic name',
    # v5 second sweep (tools/audit_noncafes.py)
    'pain-chaud': 'Amap 糕饼店; bakery',
    'la-parisienne-zhangyang': 'Amap 法式菜品餐厅|糕饼店',
    'jstone-italianbistro-hongmei-rd': 'Italian bistro',
    'jstone-italianbistro-waitan': 'Italian bistro',
    'baimakafeiguanhuayuanyangfangcanting-zhangyang-r': '花园洋房餐厅',
    'mozzarella-e-vino-luokewaitanyuan': 'wine bar / Italian',
    'mozzarella-e-vino-hengshan-rd': 'wine bar / Italian',
    'mozzarella-e-vino-xianzhonghuan': 'wine bar / Italian',
    'mozzarella-e-vino-daxue-rd': 'wine bar / Italian',
    'winehaus-guangyuanluyutianpinglujiaochakoudong40': '闻好事 winehaus · wine bar',
    'tap-that-ruijiner-rd': '喝一个精酿 · craft beer',
    'coffee-cocktail-daning-rd-735': 'Amap 酒吧 first; 鹿鸣 cocktail bar',
    'basdban-yuyuanlucanting': 'BASDBAN 愚园路餐厅',
    'maikafei-shijihuiguangchangcanting': "McCafé counter inside McDonald's",
    'wanlikafeiting-chundawanlijiu': '万丽酒店咖啡厅 · hotel dining',
    'lintaihongbei-xiuyan-rd-1181': 'Amap 糕饼店; 林太烘焙 bakery',
    'jp-bakery-guoxia-rd': '集品烘焙 bakery',
    'w-caf-sh-brunch-bistro-xianzhonghuan': 'brunch & bistro',
    '146bistro-cafe-yanchang-rd-146': 'bistro first',
}


def main() -> None:
    source = CAFES_TS.read_text(encoding='utf-8')
    head, *chunks = source.split('\n  {\n    id: ')
    kept, dropped = [], []
    for chunk in chunks:
        m = re.match(r"'([^']+)',\n", chunk)
        cid = m.group(1) if m else ''
        (dropped if cid in REMOVE else kept).append(chunk)
    missing = sorted(set(REMOVE) - {re.match(r"'([^']+)',", c).group(1) for c in dropped})
    CAFES_TS.write_text('\n  {\n    id: '.join([head, *kept]), encoding='utf-8')
    print(f'cafes.ts: kept {len(kept)}, dropped {len(dropped)}; not found: {missing}')

    ids = {re.match(r"'([^']+)',", c).group(1) for c in kept}
    unv = ROOT / 'src' / 'data' / 'unverified.json'
    before = json.loads(unv.read_text())
    after = [i for i in before if i in ids]
    unv.write_text(json.dumps(after, indent=2, ensure_ascii=False) + '\n')
    print(f'unverified.json: {len(before)} -> {len(after)}')

    dp_json = ROOT / 'src' / 'data' / 'dianping.json'
    dp = json.loads(dp_json.read_text())
    dp2 = {k: v for k, v in dp.items() if k in ids}
    dp_json.write_text(json.dumps(dp2, indent=2, ensure_ascii=False, sort_keys=True) + '\n')
    print(f'dianping.json: {len(dp)} -> {len(dp2)}')


if __name__ == '__main__':
    main()
