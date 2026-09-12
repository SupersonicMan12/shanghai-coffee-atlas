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
- 数据全部打包在前端，无后端、无账号；用户状态存 `localStorage`。
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
    ResultsStrip.tsx           罗盘结果条
    NearMePanel.tsx            「从这里出发」：定位/落针/地铁站锚点 + 步行时间排序
    ListView.tsx               移动端列表视图
    SearchBox.tsx              搜索
    QuizModal.tsx              六题测验 → 命名人格 → 拨罗盘
    CrawlList.tsx              七条步行路线
    PassportPanel.tsx          护照：盖章、徽章、收藏
    CalibrateWidget.tsx        「校准罗盘」投票控件（5 个一键问题）
    Methodology.tsx            「?」方法论页（双语，解释评分公式和证据来源）
    ShareCard.tsx / TaxiCard.tsx  分享卡 / 打车卡（中文名+地址大字）
    Onboarding.tsx             首次引导
  data/
    types.ts                   全部类型：District, Archetype, Tag, Axes, Cafe, evidence…
    cafes.ts                   553 家店（编辑字段 + evidence.amap/dianping 块）
    dianping.json              点评公开信号（评分、人均、评论量级）
    basemap.json               由 build_basemap.py 生成
    metro.ts                   地铁站锚点
    crawls.ts / labels.ts
  lib/
    scoring.ts                 贝叶斯三层混合评分（见 §5）
    match.ts                   罗盘匹配 Σ wᵢ(1−dᵢ^0.72)
    near.ts                    距离/步行时间/营业中
    votes.ts                   VoteStore 接口 + localStorage 实现
    projection.ts / hand.ts / palette.ts   投影、手绘抖动、五个时段色板
    i18n.ts / names.ts         中英切换、拼音名→中文名
    quiz.ts / passport.ts / onboard.ts
tools/
  build_basemap.py             Overpass → tools/raw/*.json → src/data/basemap.json
  amap_discover.py / amap_harvest.py   高德 POI 发现与采集（需 AMAP_WEB_API_KEY 环境变量）
  apply_signals.py             把 tools/cache/amap 合并进 cafes.ts 的 evidence.amap
  dianping_harvest.py          点评 applemaps 渠道采集 → src/data/dianping.json
  expand_atlas.py              OSM 扩充店铺
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
axis = (w_e·E + w_s·S + w_u·ū·n/(n+k)) / (w_e + w_s·1[S] + w_u·n/(n+k))
w_e=1  w_s=2  w_u=3  k=5
```

- E：编辑先验（`cafe.axes`，人工编辑的主观值）
- S：结构化信号估计，只在该店该轴有真实代理时参与（高德人均→spend；座位/营业时长/店型→linger；点评「适合办公」等印象标签→focus；评论量级+时段→energy；菜单单品/手冲信号→adventure）
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
4. 桌面打磨（最近一次提交 `0cefb63`、`54ef2c4`）：修复图钉点不开卡片（pointer capture 吞 click）；拖地图/滑杆不再选中文字；图钉尺寸随缩放变化，350 家连锁/导入店低缩放退为安静小点；标签按优先级碰撞避让（选中 > 路线 > 罗盘高分 > 有证据的精选店）；卡片 ≤1180px 不再压住 +/− 按钮；24 家只有拼音名的店显示中文名。

## 8. 已知问题 / 待办（建议顺序）

**体验**
- [ ] 默认视图标签策略：用「地标咖啡馆」优先，而不是纯分数。
- [ ] hover 预览小卡（桌面）。
- [ ] 键盘快捷键（+/− 缩放、Esc 关卡片、方向键切结果）。
- [ ] 中文模式下部分编辑笔记仍是英文；`names.ts` 的拼音→中文映射可继续补。

**数据**
- [ ] 高德覆盖 204/553，剩余店铺需继续采集（配额 100/天，脚本可断点续传）。
- [ ] 点评匹配仅 25 家有缓存；候选 id 靠搜索引擎发现，可再扩一轮，遵守 §6。
- [ ] 座位数只有约 200 家有真实数据，其他不要编造。
- [ ] 约 350 家导入连锁店（星巴克/Costa/Tim Hortons 等）只有通用占位招牌语，不要当作店铺独有信息展示。

**基础设施**
- [ ] 投票目前只在本机 `localStorage`。`VoteStore` 接口是预留的接缝，可接 Cloudflare Workers KV 或 Supabase 免费层做跨设备聚合；接上后 n≥5 的店由公众票逐步取代编辑先验。
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

随口咖仓库把本仓库的 553 家店数据和评分逻辑复制/打包为自己的 `core`，并额外做了：中文招牌语翻译、高德环境图/推荐菜/分星期营业时间、忙闲预估曲线、标签（商场/街边/景观/茶/无咖/餐食/可办公）。这些增强**没有回流**到本仓库。若要同步，建议在本仓库新增一条离线脚本从随口咖的数据文件导入，而不是手工搬运。
