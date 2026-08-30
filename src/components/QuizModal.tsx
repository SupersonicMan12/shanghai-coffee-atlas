import { useState } from 'react'
import type { Axes } from '../data/types'
import { QUIZ, axesFromAnswers, characterFor } from '../lib/quiz'
import { AXES } from '../lib/match'

interface Props {
  onClose: () => void
  onApply: (axes: Axes, characterName: string) => void
}

export function QuizModal({ onClose, onApply }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const done = step >= QUIZ.length

  if (done) {
    const axes = axesFromAnswers(answers)
    const character = characterFor(axes)
    return (
      <div className="modal-scrim" onClick={onClose}>
        <div className="quiz result" onClick={(e) => e.stopPropagation()}>
          <div className="quiz-kicker">You are</div>
          <h2>{character.name}</h2>
          <div className="zh quiz-zh">{character.nameZh}</div>
          <p className="quiz-line">{character.line}</p>
          <div className="quiz-axes">
            {AXES.map((a) => (
              <div key={a.key} className="quiz-axis">
                <span>{a.label}</span>
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
              Repaint the map for me
            </button>
            <button
              className="link"
              onClick={() => {
                setAnswers({})
                setStep(0)
              }}
            >
              Start again
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
          Question {step + 1} of {QUIZ.length}
        </div>
        <h2>{q.prompt}</h2>
        <div className="zh quiz-zh">{q.promptZh}</div>
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
              <span>{o.label}</span>
              <span className="zh">{o.labelZh}</span>
            </button>
          ))}
        </div>
        <div className="quiz-actions">
          {step > 0 && (
            <button className="link" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          <button className="link" onClick={onClose}>
            Skip the quiz
          </button>
        </div>
      </div>
    </div>
  )
}
