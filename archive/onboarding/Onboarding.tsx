import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'
import { markOnboarded } from '../lib/onboard'
import type { PhaseId } from '../lib/palette'
import type { Scenario } from '../lib/scenarios'
import { ScenarioChips } from './Compass'

/**
 * First thing a new reader sees: one question, one tap, three
 * recommendations. Nothing else to read.
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

  const finish = () => {
    markOnboarded()
    onDone()
  }

  return (
    <div className="onboard ob-scenarios" role="dialog" aria-label={t(UI.obScenarioTitle)}>
      <h3>
        {t(UI.obScenarioTitle)}
        {sub(UI.obScenarioTitle) && <span className="zh"> {sub(UI.obScenarioTitle)}</span>}
      </h3>
      <p>{t(UI.obScenarioBody)}</p>
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
      <div className="ob-actions">
        <button className="link" onClick={finish}>
          {t(UI.obJustLook)}
        </button>
      </div>
    </div>
  )
}
