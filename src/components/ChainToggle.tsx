import { UI } from '../data/labels'
import { CHAIN_BRANDS, type ChainPrefs } from '../lib/chains'
import { useI18n } from '../lib/i18n'

interface Props {
  prefs: ChainPrefs
  /** Branches per brand across the whole atlas. */
  totals: Record<string, number>
  loading: boolean
  failed: boolean
  onChange: (next: ChainPrefs) => void
}

/**
 * Chains are off until asked for, but never a secret: the pill always says
 * how many branches the sheet is holding back.
 */
export function ChainToggle({ prefs, totals, loading, failed, onChange }: Props) {
  const { mode, t } = useI18n()
  const zh = mode === 'zh'
  const off = new Set(prefs.off)
  const all = CHAIN_BRANDS.reduce((n, b) => n + (totals[b.key] ?? 0), 0)
  const shown = CHAIN_BRANDS.reduce((n, b) => n + (off.has(b.key) ? 0 : totals[b.key] ?? 0), 0)
  const count = (prefs.on ? shown : all).toLocaleString('en-US')
  const flip = (key: string) =>
    onChange({ on: true, off: off.has(key) ? prefs.off.filter((k) => k !== key) : [...prefs.off, key] })

  return (
    <div className="chain-toggle">
      <button
        className={`chain-pill${prefs.on ? ' on' : ''}`}
        aria-pressed={prefs.on}
        onClick={() => onChange({ ...prefs, on: !prefs.on })}
      >
        <span className="cp-dot" />
        <span>
          <b>{count}</b>
          {zh ? '' : ' '}
          {t(prefs.on ? UI.chainsShown : UI.chainsHidden)}
        </span>
        <span className="cp-act">{t(prefs.on ? UI.chainsHide : UI.chainsShow)}</span>
      </button>
      {prefs.on && (
        <div className="chain-brands" role="group" aria-label={t(UI.chainsWhich)}>
          {CHAIN_BRANDS.map((b) => (
            <button key={b.key} className={off.has(b.key) ? '' : 'on'} aria-pressed={!off.has(b.key)} onClick={() => flip(b.key)}>
              {zh ? b.zh : b.en}
              <span>{totals[b.key] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      {loading && <span className="chain-note">{t(UI.chainsLoading)}</span>}
      {failed && (
        <button className="chain-note" onClick={() => onChange({ ...prefs })}>
          {t(UI.chainsFailed)}
        </button>
      )}
    </div>
  )
}
