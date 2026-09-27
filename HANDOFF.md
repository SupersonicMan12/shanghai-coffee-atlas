# Shanghai Coffee Atlas — 交接文档 / Handoff

给接手本仓库的本地开发者或本地 AI agent。读完这一份就能继续开发，不需要之前的对话上下文。

Live: https://supersonicman12.github.io/shanghai-coffee-atlas/
Repo: https://github.com/SupersonicMan12/shanghai-coffee-atlas

姊妹项目 **随口咖 (suikouka)** 是独立仓库（https://github.com/SupersonicMan12/suikouka ），复用本仓库的数据和评分引擎做语音优先的微信小程序/网页。两个项目**保持分离**，本仓库不要被删除或合并进去。

---

## 1. 产品定位（不要偏离）

用户原始要求：*"create a very artistic map of shanghai's coffee shops, the goal is for the public to use it to find coffee shops of their liking... avoid a standard maps function, there must be a reason why people use your app."*

核心差异化：**「合不合适」而不是「好不好」**。
- 大众点评/高德回答「这家店评分高不高」；
- 本图集回答「此刻、这个场合、这种心情，哪家店最适合我」。
- 手段是 **罗盘 (Compass)**：五条主观轴 focus / energy / linger / adventure / spend（0–100），用户拨罗盘，每家店按距离得分 0–100 并给出一句话判词。
- 视觉是手绘水彩地图集，不是瓦片地图；没有星级、没有「最近优先」列表。
- 忙闲/人气等推断值必须标「预估」，绝不伪装成实时数据。

## 2. 技术栈

- Vite 8 + React 19 + TypeScript 6，无 UI 框架，纯 SVG 手绘渲染。
- oxlint 做 lint。无测试框架；`tools/test-scoring.mjs` 是纯 Node 断言测试。
- 数据全部打包在前端，无账号；用户状态存 `localStorage`。唯一的后端是腾讯云开发 (CloudBase) 的一个集合 `cafe_notes`，只放访客留言（见 §11）；连不上时留言存本机并自动重试。
- 部署：push 到 `main` → GitHub Actions (`.github/workflows/pages.yml`) → GitHub Pages。`BASE_PATH=/shanghai-coffee-atlas/`。
- Python 3 脚本负责离线数据管线（`tools/*.py`），不参与运行时。

## 3. 目录速查

```
src/
  App.tsx / App.css            主壳：布局、URL hash 状态、面板开关、PWA 注册
  main.tsx / index.css
  components/
    AtlasMap.tsx               地图交互层：缩放/拖拽、图钉、标签碰撞避让、点击选中
    BaseLayers.tsx             水彩底图：区界、道路、里弄、公园、水系（来自 basemap.json）
    Glyphs.tsx                 十种店型 (Archetype) 的手绘图钉
    Compass.tsx                五轴罗盘控件（核心交互）
    CafeCard.tsx               单店详情卡
    CafePhotos.tsx             卡片照片：门脸优先排序、角色标签、灯箱
    CafeNotes.tsx              「去过的人说」：无登录留言（署名/匿名），待审核状态可见
    ResultsStrip.tsx           罗盘结果条
    LocationPanel.tsx          起点：默认用定位；备选输入地铁站 / 点地图落针
    ListView.tsx               移动端列表视图
    SearchBox.tsx              搜索
    PassportPanel.tsx          护照：盖章、徽章、收藏
    CalibrateWidget.tsx        「校准罗盘」投票控件（5 个一键问题）
    Methodology.tsx            「?」方法论页（双语，解释评分公式和证据来源）
    ShareCard.tsx / TaxiCard.tsx  分享卡 / 打车卡（中文名+地址大字）
    Verdict.tsx / BottomSheet.tsx  判词 / 移动端底部抽屉
  data/
    types.ts                   全部类型：District, Archetype, Tag, Axes, Cafe, evidence…
    cafes.ts                   951 家店（v5/v5.1 清理餐厅等非咖啡馆后；编辑字段 + evidence 块）
    details.json               由 tools/build_details.py 生成：照片(含 photoKinds 角色)、菜品、周营业时间、实证特征、判词、axisHints。**不要手改**
    dianping.json              点评公开信号（评分、人均、评论量级）
    basemap.json               由 build_basemap.py 生成
    metro.ts                   地铁站锚点
    labels.ts                  全部界面文案（中英对）
  lib/
    scoring.ts                 贝叶斯三层混合评分（见 §5）
    match.ts                   罗盘匹配 Σ wᵢ(1−dᵢ^0.72)
    near.ts                    距离/步行时间/营业中
    votes.ts                   VoteStore 接口 + localStorage 实现
    notes.ts / cloud.ts        留言存储（本机优先 + CloudBase 同步）/ CloudBase 匿名登录句柄
    details.ts / why.ts        读取 details.json / 每轴「为什么是这个分」解释
    projection.ts / hand.ts / palette.ts   投影、手绘抖动、五个时段色板
    i18n.ts / names.ts         中英切换、拼音名→中文名
    passport.ts                护照：盖章、收藏、留言计数、徽章
archive/                       v5 下线但保留的功能副本（七条路线、六题测验），不参与编译
tools/
  build_basemap.py             Overpass → tools/raw/*.json → src/data/basemap.json
  amap_discover.py / amap_harvest.py   高德 POI 发现与采集（需 AMAP_WEB_API_KEY 环境变量）
  apply_signals.py             把 tools/cache/amap 合并进 cafes.ts 的 evidence.amap
  dianping_harvest.py          点评 applemaps 渠道采集 → src/data/dianping.json
  expand_atlas.py              OSM 扩充店铺
  enrich_amap_detail.py        高德详情（照片/菜品/周营业时间/人均）→ tools/cache/amap-detail，支持 --only / --retry-rejected 断点续传
  enrich_vision.py             Qwen-VL 读照片：结构化事实 + 照片角色（门脸/室内/饮品/餐食/菜单），需 DASHSCOPE_API_KEY
  enrich_web.py                公开网页原句（带出处）
  axis_evidence.py             证据→五轴读数（纯确定性，见 §5）
  audit_photos.py              离线照片身份审计：店名/分店/距离/店型不符即屏蔽
  build_details.py             汇总以上缓存 → src/data/details.json（`--no-model` 纯离线重建）
  cache/{amap,dianping,osm}    已提交的采集缓存（可复现、可断点续传）
  test-scoring.mjs             评分函数断言测试
docs/
  PLAN.md                      v2 扩展计划（数据来源、评分模型、功能）
  dianping-feasibility.md      点评数据合规采集路线与理由（重要，动数据前先读）
```

## 4. 本地运行

```bash
git clone https://github.com/SupersonicMan12/shanghai-coffee-atlas.git
cd shanghai-coffee-atlas
npm install
npm run dev        # http://localhost:5173
npm run lint       # oxlint
npx tsc -b --noEmit
npm run build      # tsc -b && vite build → dist/
node tools/test-scoring.mjs
```

Node 20.19+ 或 22 推荐（CI 用 22）。Python 3.10+ 只在跑数据脚本时需要，无第三方依赖之外的要求（见各脚本头部）。

数据脚本：

```bash
python3 tools/build_basemap.py                       # 重新生成底图（联网 Overpass）
AMAP_WEB_API_KEY=xxx python3 tools/amap_harvest.py   # 高德采集，写入 tools/cache/amap
python3 tools/apply_signals.py                       # 离线合并到 cafes.ts
python3 tools/dianping_harvest.py                    # 点评公开信号，≥2.5s/请求，带缓存
```

密钥只从环境变量读，**永远不要写进仓库**。高德个人 key 在 https://console.amap.com 申请。

## 5. 评分模型（改算法前必读）

`src/lib/scoring.ts`，每条轴：

```
axis = (w_e·(1−c_h)·E + w_h·c_h·H + w_u·ū·n/(n+k)) / (w_e·(1−c_h) + w_h·c_h + w_u·n/(n+k))
w_e=1  w_h=3  w_u=3  k=5
```

- E：编辑先验（`cafe.axes`，人工编辑的主观值），权重随证据置信度 c_h 上升而衰减——证据充分时猜测不再把店拉回中间。
- H/c_h：`details.json` 里的 `axisHints`，由 `tools/axis_evidence.py` 离线从**可复核的读数**推出：照片结构化事实（笔记本、站立吧台、烘豆机…）、带出处的网页原句、高德/点评人均与菜单价。多条读数同向时才向 0/100 推（`corroborated()`），互相矛盾则停在加权均值附近；每条读数保留原因，卡片上可展开。座位数、店型、营业时长等**猜测性回退已删除**，无证据的轴只剩编辑先验并显示为淡线。
- ū/n：读者校准投票，k=5 收缩，一票动不了、五票一致能动
- 高德/点评评分只做 **置信度徽章**，不进轴——「4.8 分」说明「好」，不说明「适合专心工作」，混淆这两者正是其他应用的错误。
- 每轴附 confidence，地图上用墨色浓淡表达（实线=证据充分，淡线=编辑猜测）。

罗盘匹配：`match.ts` 中 `Σ wᵢ(1−dᵢ^0.72)`。

## 6. 数据来源与合规红线

- 店名/坐标/街道：OpenStreetMap（ODbL）+ 公开咖啡指南。
- 高德 Web API：官方接口、个人免费 key、100 次/天配额，已缓存 204 家。
- 大众点评：**不做大规模爬取**。只用点评面向 Apple Maps 的公开服务端渲染页 `m.dianping.com/shop/<id>?msource=applemaps`，一店一页、串行、≥2.5s 间隔、仅取聚合信号（评分、人均、评论量级、类目、商圈），**不取评论正文和用户数据**。完整理由见 `docs/dianping-feasibility.md`。若点评开始返回空壳/验证码，脚本退避并保留部分覆盖，不要绕过。
- 店型、五轴、标签、每条笔记都是**图集自己的编辑观点**，不是商家事实。营业时间仅供参考。
- 不得人工逐家抄录几百家店的数据；扩展必须走脚本管线。

## 7. 已完成的里程碑（按时间）

1. v1：75 家精选店，手绘 SVG 地图、罗盘、六题测验、十种店型图钉、七条步行路线、护照、打车卡、五时段色板、URL hash 分享。
2. v2 数据：扩到 203 家并接高德证据；贝叶斯评分引擎 + 「?」方法论页；「从这里出发」（定位/落针/地铁站）+ 营业中滤镜 + 步行时间；校准投票控件（本地存储）；分享卡、PWA。
3. v3：扩到 **553 家**、内环全覆盖、底图外扩、更多地铁站；移动端优先重构（中文 UI 模式、搜索、列表视图、触控人体工学、首次引导、性能）；点评公开信号采集并接入评分。
4. 桌面打磨：修复图钉点不开卡片（pointer capture 吞 click）；拖地图/滑杆不再选中文字；图钉尺寸随缩放变化；标签按优先级碰撞避让；24 家只有拼音名的店显示中文名。
5. v4（PR #11）：1053 家全城覆盖；每店一句「为什么是它」判词；高德详情 + Qwen-VL 照片 + 网页原句三路富化 → `details.json`；地图引擎重写（惯性、双击、平滑缩放）。
6. v5（PR #12）：只留罗盘 + 护照；起点默认定位；时间条真正让闭店消失；清掉 95 家餐厅/非咖啡馆；错配照片屏蔽；顶栏缩小；引导文案去艺术化。路线/测验副本在 `archive/`。
7. v5.1（PR #13）：图钉成为位置栏第一排；五轴评分改为纯证据驱动（§5）；全部 951 家重抓；装修中/暂停营业店全时段闭店。
8. v6：照片角色（门脸→室内→饮品/餐食→菜单）+ 灯箱 + 离线身份审计；访客留言（§11）接入卡片/地图/护照；定位光晕居中；评分向两极拉开（同向证据才推）；高德/视觉脚本可断点续传。

## 8. 已知问题 / 待办（建议顺序）

**体验**
- [ ] 默认视图标签策略：用「地标咖啡馆」优先，而不是纯分数。
- [ ] hover 预览小卡（桌面）。
- [ ] 键盘快捷键（+/− 缩放、Esc 关卡片、方向键切结果）。
- [ ] 中文模式下部分编辑笔记仍是英文；`names.ts` 的拼音→中文映射可继续补。

**数据**
- [ ] 约 215 家仍无照片：高德库里找不到、或照片身份审计不过。可等高德日配额（0 点重置）后跑 `python3 tools/enrich_amap_detail.py --retry-rejected` / `--only <id>`，再 `build_details.py`。别名表 `tools/amap_aliases.json`（`rac-anfu`、`rumors-roastery` 两条仍待权威地址核实）。
- [ ] Qwen-VL 照片角色只跑了有免费额度的部分；百炼充值后 `python3 tools/enrich_vision.py` 会只补漏（`PROMPT_VERSION` 变更才全量）。
- [ ] 点评匹配缓存有限；候选 id 靠搜索引擎发现，可再扩一轮，遵守 §6。
- [ ] 座位数只有部分店有真实数据，其他不要编造。
- [ ] 导入连锁店（星巴克/Costa/Tim Hortons 等）只有通用占位招牌语，不要当作店铺独有信息展示。

**基础设施**
- [ ] 投票目前只在本机 `localStorage`。`VoteStore` 接口是预留的接缝，可以像留言一样接到 CloudBase；接上后 n≥5 的店由公众票逐步取代编辑先验。
- [ ] 留言审核：目前只能在云开发控制台数据库里把 `status` 改成 `approved`/`rejected`；可以写一个云函数或简单管理页。
- [ ] 留言带图（先做文本是有意的；上传走 CloudBase 云存储，需内容审核）。
- [ ] 每店静态预渲染页（SEO）。
- [ ] 微信内分享图导出已做，可考虑小程序码。

## 9. 开发约定

- 小而聚焦的改动，跟随现有风格；不要引入 UI 库或地图瓦片库。
- 改 `src/data/types.ts` 的 `Cafe` 结构时同步更新 `tools/apply_signals.py` 和 `expand_atlas.py` 的写回逻辑。
- 任何推断值（忙闲、人气、置信度）在 UI 上都要能看出是推断。
- 提交前：`npm run lint && npx tsc -b --noEmit && npm run build && node tools/test-scoring.mjs`。
- 分支命名无强制要求；直接 push `main` 即触发部署。Pages 源已设为 GitHub Actions。
- 不要提交 `tools/shots/`（截图）、`tools/.test-dist/`、任何密钥。

## 10. 与随口咖的关系

本仓库是数据源头。随口咖用 `tools/sync-atlas.ts` 读**并排 clone** 的本仓库（`../shanghai-coffee-atlas`），生成自己的 `src/data/{cafes,metro,details,types}.ts`，再打包进小程序：

```bash
cd ../shanghai-coffee-atlas && git pull
cd ../suikouka && git pull
npm run sync:atlas      # 也可 npm run sync:atlas -- /path/to/shanghai-coffee-atlas
npm run build:mp        # 重新打包 core.js
```

目前导出的字段：全部店铺、地铁锚点、每店第 1 张照片（v6 起排序为门脸优先，所以拿到的就是店面图）、≤3 个菜品、周营业时间、≤3 条置信度 ≥0.5 的中文特征、高德评分。**尚未导出**：照片角色 `photoKinds`、更多照片、判词、axisHints、留言。要用它们，改 `suikouka/tools/sync-atlas.ts` 的 `toDetail()` 即可，源字段都在 `details.json`。留言库 `cafe_notes` 在同一个云开发环境 `cloudbase-d6ghx3rq70e1f82cf`，小程序可直接用 `wx.cloud.database()` 读 `status == 'approved'` 的文档，不必经过本仓库。

## 11. 访客留言（CloudBase）

- 环境 `cloudbase-d6ghx3rq70e1f82cf`，集合 `cafe_notes`；网页端用 `@cloudbase/js-sdk` 匿名登录写入，字段 `{_id, cafeId, name|null, text, status:'pending', at, client}`。
- 写入一律 `pending`；只有 `approved` 对公众可见；本机能看到自己的待审/被拒留言。待审留言永远不当作店铺事实。
- **控制台需要做的配置（未做则网页只存本机，提示「共享留言暂时不可用」）**：
  1. 云开发控制台 → 身份认证/登录方式 → 开启**匿名登录**（当前报错「请联系开发者在身份源列表开启匿名登录」）。
  2. 环境设置 → 安全来源/Web 安全域名 → 加 `supersonicman12.github.io`（本地调试再加 `localhost`）。
  3. 数据库 → 新建集合 `cafe_notes`，权限用自定义安全规则：
     ```json
     {
       "read": "doc.status == 'approved' || doc._openid == auth.openid",
       "create": "doc.status == 'pending' && doc._openid == auth.openid",
       "update": false,
       "delete": false
     }
     ```
     审核在控制台改 `status`（或将来用云函数）。
- 前端拿不到云端时不报错、不阻塞：留言先写 `localStorage`，下次打开自动重推。
