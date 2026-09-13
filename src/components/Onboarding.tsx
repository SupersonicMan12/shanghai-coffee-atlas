import { useState } from 'react'
import { UI } from '../data/labels'
import { useI18n, type Pair } from '../lib/i18n'
import { markOnboarded } from '../lib/onboard'
import type { PhaseId } from '../lib/palette'
import type { Scenario } from '../lib/scenarios'
import { ScenarioChips } from './Compass'

const STEPS: { title: Pair; body: Pair }[] = [
  { title: UI.obScenarioTitle, body: UI.obScenarioBody },
  { title: UI.obCompassTitle, body: UI.obCompassBody },
  { title: UI.obCalibrateTitle, body: UI.obCalibrateBody },
  { title: UI.obNearTitle, body: UI.obNearBody },
]

/**
 * First thing a new reader sees: "what is the next hour for?" — one tap
 * sets the compass and the atlas answers. The tour continues from there.
 */
export function Onboarding({
  onDone,
  onScenario,
  phaseId,
}: {
  onDone: () => void
  onScenario: (s: Scenario) => void
  phaseId: PhaseId
}) {
  const { t, sub } = useI18n()
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  const finish = () => {
    markOnboarded()
    onDone()
  }

  return (
    <div className={`onboard${step === 0 ? ' ob-scenarios' : ''}`} role="dialog" aria-label={t(s.title)}>
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
      {step === 0 && (
        <ScenarioChips
          activeId={null}
          modified={false}
          phaseId={phaseId}
          showTitle={false}
          onPick={(sc) => {
            if (!sc) return
            onScenario(sc)
            finish()
          }}
        />
      )}
      <div className="ob-actions">
        <button className="link" onClick={finish}>
          {step === 0 ? t(UI.obJustLook) : t(UI.obSkip)}
        </button>
        <button className="ob-next" onClick={() => (last ? finish() : setStep((v) => v + 1))}>
          {last ? t(UI.obDone) : t(UI.obNext)}
        </button>
      </div>
    </div>
  )
}
