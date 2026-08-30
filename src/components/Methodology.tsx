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
            Each axis is a weighted average of three tiers of evidence: what we
            judged (editorial), what can be measured (seats, hours, prices,
            menus), and what readers vote. Measurement outweighs our opinion;
            enough consistent readers outweigh both.
          </p>
          <p className="zh">
            每个维度是三层证据的加权平均：编辑判断、可测量的信号（座位、营业时间、价格、菜单），以及读者投票。实测比编辑意见更重，足够多的一致读者票数比两者都重。
          </p>
          <pre className="method-formula">
{`axis = ( wₑ·E + wₛ·S + wᵤ·ū·n/(n+k) )
       ─────────────────────────────
       ( wₑ + wₛ·1[S] + wᵤ·n/(n+k) )

E  editorial prior 编辑判断      wₑ = 1
S  measured signal 实测信号      wₛ = 2  (only when it exists)
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
            Measured vs. editorial vs. voted <span className="zh">实测 · 编辑 · 投票</span>
          </h3>
          <p>
            <strong>Measured:</strong> spend from Amap 人均 prices ranked
            against the whole dataset; linger from seats, opening span and
            archetype (a standing bar cannot invite you to stay); focus from
            seat count and laptop/no-laptop/books evidence; energy from
            archetype, tags and hours; adventure from menu signals
            (single-origin, own roast, laboratory brewing).{' '}
            <strong>Editorial:</strong> everything else — and it says so.{' '}
            <strong>Voted:</strong> nothing yet; the widget is coming.
          </p>
          <p className="zh">
            <strong>实测：</strong>价位来自高德人均消费在全数据集中的分位；停留来自座位数、营业时长与店型（立饮吧留不住人）；专注来自座位与“可办公/谢绝电脑/有书”标签；气氛来自店型、标签与时段；风味来自菜单信号（单一产地、自家烘焙、实验室手法）。<strong>编辑：</strong>其余一切——而且我们直说。<strong>投票：</strong>暂无，插件即将上线。
          </p>
          <p>
            Amap star ratings never enter the axes. A 4.8 says “good”, not
            “good <em>for deep work</em>” — conflating the two is exactly what
            other maps do wrong.
          </p>
          <p className="zh">
            高德星级从不进入五维评分。4.8 分只说明“好”，并不说明“适合专注工作”——把两者混为一谈正是其他地图的通病。
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
              Measured proxies are proxies: seat counts are estimates, tags are
              incomplete, and 人均 prices lag reality.
              <span className="zh">实测信号终究是代理量：座位数是估计，标签不完整，人均价格滞后于现实。</span>
            </li>
            <li>
              No reader votes exist yet, so today's confidence tops out well
              below certainty — by design.
              <span className="zh">读者投票尚未开始，所以当前的置信度远未到笃定——这是有意为之。</span>
            </li>
            <li>
              Dianping's richer opinion data is closed; we refuse to scrape it,
              so the loudest public signal in the city is missing.
              <span className="zh">大众点评的数据是封闭的；我们拒绝爬取，因此城中最响亮的公共声音在此缺席。</span>
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
