import { useMemo, useState } from 'react'
import type { Axes, Cafe } from '../data/types'
import { useMyVote } from '../lib/votes'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

/**
 * "Calibrate the compass" — thirty seconds, five one-tap questions, one per
 * axis. Readers who were actually in the room correct the editorial guess;
 * enough of them and the guess stops being a guess.
 */

interface Question {
  key: keyof Axes
  q: string
  qZh: string
  options: { label: string; labelZh: string; value: number }[]
}

const QUESTIONS: Question[] = [
  {
    key: 'focus',
    q: 'How easy was it to work here?',
    qZh: '在这里办公容易吗？',
    options: [
      { label: 'Talk, not laptops', labelZh: '聊天为主', value: 15 },
      { label: 'A while, politely', labelZh: '待一阵没问题', value: 50 },
      { label: 'Deep-work easy', labelZh: '专注办公很自在', value: 85 },
    ],
  },
  {
    key: 'energy',
    q: 'How loud was the room?',
    qZh: '室内气氛如何？',
    options: [
      { label: 'Library hush', labelZh: '安静如图书馆', value: 15 },
      { label: 'A pleasant hum', labelZh: '有点人声', value: 50 },
      { label: 'Full and buzzing', labelZh: '热闹喧腾', value: 85 },
    ],
  },
  {
    key: 'linger',
    q: 'How long did you want to stay?',
    qZh: '你想停留多久？',
    options: [
      { label: 'Drink and go', labelZh: '喝完就走', value: 15 },
      { label: 'One unhurried cup', labelZh: '慢慢一杯', value: 50 },
      { label: 'Hours, happily', labelZh: '一坐几小时', value: 85 },
    ],
  },
  {
    key: 'adventure',
    q: 'How adventurous was the cup?',
    qZh: '这杯咖啡有多冒险？',
    options: [
      { label: 'Faithful classics', labelZh: '经典稳妥', value: 15 },
      { label: 'A twist or two', labelZh: '略有新意', value: 50 },
      { label: 'Genuinely surprising', labelZh: '出人意料', value: 85 },
    ],
  },
  {
    key: 'spend',
    q: 'How did the bill feel?',
    qZh: '价格感觉如何？',
    options: [
      { label: 'Everyday money', labelZh: '日常价位', value: 15 },
      { label: 'Fair for what it is', labelZh: '物有所值', value: 50 },
      { label: 'A splurge', labelZh: '小小奢侈', value: 85 },
    ],
  },
]

export function CalibrateWidget({ cafe }: { cafe: Cafe }) {
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const { mine, cast, retract, count } = useMyVote(cafe.id)
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<Partial<Axes>>({})

  const answered = useMemo(
    () => Object.values(answers).filter((v) => typeof v === 'number').length,
    [answers],
  )

  if (!open) {
    return (
      <div className="calibrate">
        <button className="cal-open" onClick={() => setOpen(true)}>
          {mine ? t(UI.recalibrate) : t(UI.calibrate)}
          {mode === 'both' && (
            <span className="zh"> · {mine ? '重新校准罗盘' : '校准罗盘'}</span>
          )}
        </button>
        {mine && (
          <span className="cal-state">
            {t(UI.calibratedByYou)}
            {mode === 'both' && <span className="zh">· 你已校准</span>}
          </span>
        )}
        {count > 0 && (
          <span className="cal-count">
            {zh
              ? `${count} ${t(UI.readingsOnFile)}`
              : `${count} ${count === 1 ? t(UI.readingOnFile) : t(UI.readingsOnFile)}`}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="calibrate open">
      <div className="cal-head">
        <strong>
          {t(UI.calibrate)}
          {mode === 'both' && <span className="zh"> · 校准罗盘</span>}
        </strong>
        <span className="cal-sub">
          {t(UI.calibrateSub)}
          {mode === 'both' && <span className="zh"> 五个问题，三十秒。</span>}
        </span>
      </div>
      {QUESTIONS.map((question) => (
        <div key={question.key} className="cal-q">
          <div className="cal-question">
            {zh ? question.qZh : question.q}
            {mode === 'both' && <span className="zh"> {question.qZh}</span>}
          </div>
          <div className="cal-options">
            {question.options.map((o) => {
              const on = answers[question.key] === o.value
              return (
                <button
                  key={o.value}
                  className={`cal-opt${on ? ' on' : ''}`}
                  onClick={() =>
                    setAnswers((a) => {
                      const next = { ...a }
                      if (on) delete next[question.key]
                      else next[question.key] = o.value
                      return next
                    })
                  }
                >
                  {zh ? o.labelZh : o.label}
                  {mode === 'both' && <span className="zh">{o.labelZh}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="cal-foot">
        <button
          className="cal-submit"
          disabled={answered === 0}
          onClick={() => {
            const clean: Partial<Axes> = {}
            for (const q of QUESTIONS) {
              const v = answers[q.key]
              if (typeof v === 'number') clean[q.key] = v
            }
            cast(clean)
            setOpen(false)
            setAnswers({})
          }}
        >
          {answered === 0
            ? t(UI.tapAnswerFirst)
            : zh
              ? `提交 ${answered}/5`
              : `${t(UI.fileAnswers)} ${answered} ${t(UI.ofFive)}${mode === 'both' ? ' · 提交' : ''}`}
        </button>
        <button
          className="cal-cancel"
          onClick={() => {
            setOpen(false)
            setAnswers({})
          }}
        >
          {t(UI.notNow)}
        </button>
        {mine && (
          <button className="cal-cancel" onClick={() => retract()}>
            {t(UI.withdrawVote)}
          </button>
        )}
      </div>
    </div>
  )
}
