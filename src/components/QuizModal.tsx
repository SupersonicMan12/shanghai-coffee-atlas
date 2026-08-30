import { useState } from 'react'
import type { Axes } from '../data/types'
import { QUIZ, axesFromAnswers, characterFor } from '../lib/quiz'
import { AXES } from '../lib/match'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

interface Props {
  onClose: () => void
  onApply: (axes: Axes, characterName: string) => void
}

export function QuizModal({ onClose, onApply }: Props) {
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const done = step >= QUIZ.length

  if (done) {
    const axes = axesFromAnswers(answers)
    const character = characterFor(axes)
    return (
      <div className="modal-scrim" onClick={onClose}>
        <div className="quiz result" onClick={(e) => e.stopPropagation()}>
          <div className="quiz-kicker">{t(UI.youAre)}</div>
          <h2>{zh ? character.nameZh : character.name}</h2>
          {mode === 'both' && <div className="zh quiz-zh">{character.nameZh}</div>}
          <p className="quiz-line">{character.line}</p>
          <div className="quiz-axes">
            {AXES.map((a) => (
              <div key={a.key} className="quiz-axis">
                <span>{zh ? a.labelZh : a.label}</span>
                <span className="qa-track">
                  <span className="qa-dot" style={{ left: `${axes[a.key]}%` }} />
                </span>
                <span className="qa-val">{axes[a.key]}</span>
              </div>
            ))}
          </div>
          <div className="quiz-actions">
            <button
              className="primary"
              onClick={() => {
                onApply(axes, character.name)
                onClose()
              }}
            >
              {t(UI.repaintMap)}
            </button>
            <button
              className="link"
              onClick={() => {
                setAnswers({})
                setStep(0)
              }}
            >
              {t(UI.startAgain)}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const q = QUIZ[step]
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="quiz" onClick={(e) => e.stopPropagation()}>
        <div className="quiz-progress">
          {QUIZ.map((_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <div className="quiz-kicker">
          {zh
            ? `第 ${step + 1} 题，共 ${QUIZ.length} 题`
            : `Question ${step + 1} of ${QUIZ.length}`}
        </div>
        <h2>{zh ? q.promptZh : q.prompt}</h2>
        {mode === 'both' && <div className="zh quiz-zh">{q.promptZh}</div>}
        <div className="quiz-options">
          {q.options.map((o) => (
            <button
              key={o.id}
              className={answers[q.id] === o.id ? 'on' : ''}
              onClick={() => {
                setAnswers((a) => ({ ...a, [q.id]: o.id }))
                setStep((s) => s + 1)
              }}
            >
              <span>{zh ? o.labelZh : o.label}</span>
              {mode === 'both' && <span className="zh">{o.labelZh}</span>}
            </button>
          ))}
        </div>
        <div className="quiz-actions">
          {step > 0 && (
            <button className="link" onClick={() => setStep((s) => s - 1)}>
              {t(UI.back)}
            </button>
          )}
          <button className="link" onClick={onClose}>
            {t(UI.skipQuiz)}
          </button>
        </div>
      </div>
    </div>
  )
}
