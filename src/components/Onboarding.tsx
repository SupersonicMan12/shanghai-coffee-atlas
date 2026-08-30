import { useState } from 'react'
import { UI } from '../data/labels'
import { useI18n, type Pair } from '../lib/i18n'
import { markOnboarded } from '../lib/onboard'

const STEPS: { title: Pair; body: Pair }[] = [
  { title: UI.obCompassTitle, body: UI.obCompassBody },
  { title: UI.obCalibrateTitle, body: UI.obCalibrateBody },
  { title: UI.obNearTitle, body: UI.obNearBody },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { t, sub } = useI18n()
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  const finish = () => {
    markOnboarded()
    onDone()
  }

  return (
    <div className="onboard" role="dialog" aria-label={t(UI.obCompassTitle)}>
      <div className="ob-dots">
        {STEPS.map((_, i) => (
          <span key={i} className={i === step ? 'on' : ''} />
        ))}
      </div>
      <h3>
        {t(s.title)}
        {sub(s.title) && <span className="zh"> {sub(s.title)}</span>}
      </h3>
      <p>{t(s.body)}</p>
      <div className="ob-actions">
        <button className="link" onClick={finish}>
          {t(UI.obSkip)}
        </button>
        <button
          className="ob-next"
          onClick={() => (last ? finish() : setStep((v) => v + 1))}
        >
          {last ? t(UI.obDone) : t(UI.obNext)}
        </button>
      </div>
    </div>
  )
}
