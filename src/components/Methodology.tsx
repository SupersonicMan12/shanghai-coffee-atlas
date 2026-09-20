interface Props {
  onClose: () => void
}

/**
 * The “?” page. Everything the compass claims, it explains here — sources,
 * the blend, and what it honestly does not know. Part of the brand.
 */
export function Methodology({ onClose }: Props) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <article className="method" onClick={(e) => e.stopPropagation()}>
        <button className="card-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="method-kicker">How the compass is drawn</div>
        <h2>Methodology</h2>
        <div className="method-zh zh">指南针是怎么画出来的 · 方法说明</div>

        <section>
          <h3>
            Where the ink comes from <span className="zh">数据来源</span>
          </h3>
          <ul className="method-sources">
            <li>
              <strong>OpenStreetMap</strong> — every street, park and café
              location is real ODbL geometry, redrawn by hand.
              <span className="zh">所有街道与坐标来自 OpenStreetMap（ODbL），再手工重绘。</span>
            </li>
            <li>
              <strong>Amap 高德地图</strong> — structured facts: canonical
              names, hours, and 人均 spend for dining POIs.
              <span className="zh">高德提供结构化事实：名称、营业时间与人均消费。</span>
            </li>
            <li>
              <strong>Dianping 大众点评</strong> — public shop pages (the ones
              Dianping serves to Apple Maps, no login, no scraping walls):
              star rating, review volume and 人均 spend.
              <span className="zh">大众点评公开商户页（为 Apple 地图提供的页面，无需登录）：星级、评论量与人均消费。</span>
            </li>
            <li>
              <strong>Editorial fieldwork</strong> — we sat in these rooms. The
              five axes start as our considered, subjective read.
              <span className="zh">编辑实地走访——五个维度首先是我们主观但认真的判断。</span>
            </li>
            <li>
              <strong>Reader votes</strong> <em>(coming)</em> — a 30-second
              calibration on each café card, so the city corrects us.
              <span className="zh">读者投票（即将上线）——让这座城市来纠正我们。</span>
            </li>
          </ul>
        </section>

        <section>
          <h3>
            The blend <span className="zh">评分如何混合</span>
          </h3>
          <p>
            Each axis is a weighted average of three tiers: what we judged
            (editorial), what the evidence shows (checkable readings from
            photos, quoted public pages and listed prices), and what readers
            vote. Evidence outweighs our opinion in proportion to its own
            confidence; enough consistent readers outweigh both.
          </p>
          <p className="zh">
            每个维度是三层的加权平均：编辑判断、证据（照片里可核实的事实、公开网页的原文引述、列出的价格），以及读者投票。证据按它自己的置信度压过编辑意见；足够多的一致读者票数比两者都重。
          </p>
          <pre className="method-formula">
{`axis = ( wₑ·E + wₕ·cₕ·H + wᵤ·ū·n/(n+k) )
       ───────────────────────────────
       ( wₑ + wₕ·cₕ + wᵤ·n/(n+k) )

E  editorial prior 编辑判断      wₑ = 1
H  evidence reading 证据读数     wₕ = 3  × its confidence cₕ
ū  mean reader vote 读者均值     wᵤ = 3
n  number of votes 票数          k  = 5`}
          </pre>
          <p>
            The <code>n/(n+k)</code> term is the honesty clause — shrinkage.
            One loud opinion barely moves a café; five consistent ones can
            genuinely move it, and beyond that the readers steadily take over.
          </p>
          <p className="zh">
            <code>n/(n+k)</code> 是诚实条款——收缩系数。一条激烈的评价几乎撼动不了一家店；五条一致的评价可以，而票数越多，读者的声音越占上风。
          </p>
        </section>

        <section>
          <h3>
            Evidence vs. editorial vs. voted <span className="zh">证据 · 编辑 · 投票</span>
          </h3>
          <p>
            <strong>Evidence</strong> is a short list of readings, each one
            something you could check yourself: in the photos — people on
            laptops, sockets by the seats, a stand-up bar with no chairs, a
            roaster or brew bar, a full room; on public pages — a quoted
            snippet saying quiet or lively, good for a long sit or grab-and-go,
            pour-over on the menu, a price; and listed numbers — Amap and
            Dianping 人均, menu prices legible in a photo. Each reading has a
            fixed value and weight; the axis is their weighted mean and the
            card shows the two heaviest reasons. Archetype, tags, seat guesses
            and opening hours move nothing.{' '}
            <strong>Editorial:</strong> everything else — and it says so.{' '}
            <strong>Voted:</strong> nothing yet; the widget is coming.
          </p>
          <p className="zh">
            <strong>证据</strong>是一小串你自己也能核对的读数：照片里——有人用电脑、座位旁有插座、没有座位的站喝吧台、烘豆机或手冲台、满座；公开网页里——原文写到安静或热闹、适合久坐或以外带为主、有手冲单品、价格；列出的数字——高德与点评人均、照片里看得清的菜单价。每条读数有固定的值和权重，维度是它们的加权平均，卡片上写出最重的两条理由。店型、标签、座位估算和营业时长不再影响任何维度。<strong>编辑：</strong>其余一切——而且我们直说。<strong>投票：</strong>暂无，插件即将上线。
          </p>
          <p>
            Amap and Dianping star ratings never enter the axes. A 4.8 says
            “good”, not “good <em>for deep work</em>” — conflating the two is
            exactly what other maps do wrong. A café's rating × review volume
            only deepens our <em>confidence</em> ink.
          </p>
          <p className="zh">
            高德与大众点评的星级从不进入五维评分。4.8 分只说明“好”，并不说明“适合专注工作”——把两者混为一谈正是其他地图的通病。星级×评论量只用来加深置信度的墨色。
          </p>
        </section>

        <section>
          <h3>
            Confidence as ink <span className="zh">墨色即置信度</span>
          </h3>
          <p>
            On every café card, each axis stroke is inked by how much evidence
            sits behind it: a solid stroke is well-evidenced, a faint sketch is
            our editorial guess. Honest uncertainty is part of the brand.
          </p>
          <p className="zh">
            在每张咖啡馆卡片上，每条维度笔画的墨色深浅代表证据多少：实线笔画有据可依，浅淡的素描只是编辑的判断。坦白的不确定性也是本图集的一部分。
          </p>
        </section>

        <section>
          <h3>
            Limitations <span className="zh">局限</span>
          </h3>
          <ul className="method-limits">
            <li>
              The editorial prior is one palate's opinion, visited at one hour
              of one day. Rooms change; baristas leave.
              <span className="zh">编辑判断只是一副味蕾在某天某个时刻的意见。房间会变，咖啡师会走。</span>
            </li>
            <li>
              Evidence is thin where photos are few: a room nobody has
              photographed working in is not thereby bad for working. 人均
              prices lag reality and, at a restaurant that also pours coffee,
              describe a meal.
              <span className="zh">照片少的店证据就少：没人拍到有人办公，不等于不适合办公。人均价格滞后于现实，兼做餐饮的店人均说的是一餐而不是一杯。</span>
            </li>
            <li>
              No reader votes exist yet, so today's confidence tops out well
              below certainty — by design.
              <span className="zh">读者投票尚未开始，所以当前的置信度远未到笃定——这是有意为之。</span>
            </li>
            <li>
              Dianping coverage is partial: only shops we could match by name
              on public pages, read politely and cached — no logins, no
              captcha bypass, no review text.
              <span className="zh">大众点评的覆盖是部分的：只收录能在公开页面上按名称匹配到的店，礼貌地读取并缓存——不登录、不绕验证码、不抓评论正文。</span>
            </li>
          </ul>
        </section>

        <div className="method-foot">
          Argue with the compass. When votes open, your argument counts.
          <span className="zh">欢迎和指南针抬杠——投票上线后，你的抬杠就会算数。</span>
        </div>
      </article>
    </div>
  )
}
