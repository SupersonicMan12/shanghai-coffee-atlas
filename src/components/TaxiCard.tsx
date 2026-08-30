import type { Cafe } from '../data/types'
import { DISTRICT_ZH, UI } from '../data/labels'
import { useI18n } from '../lib/i18n'

/**
 * The single most useful screen in the app for anyone who does not read
 * Chinese: hold the phone up to a driver and say nothing. Big type, no
 * decoration, dark ink on a pale card so it survives a sunny back seat.
 */
export function TaxiCard({
  cafe,
  onClose,
  onSaveImage,
}: {
  cafe: Cafe
  onClose: () => void
  onSaveImage: () => void
}) {
  const { mode, t } = useI18n()
  const line = `${cafe.streetZh}，${DISTRICT_ZH[cafe.district]}区`
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="taxi" onClick={(e) => e.stopPropagation()}>
        <div className="taxi-top">师傅，请带我去这里</div>
        <div className="taxi-name">{cafe.nameZh}</div>
        <div className="taxi-addr">{line}</div>
        <div className="taxi-latin">
          {cafe.name} · {cafe.street}, {cafe.district}
        </div>
        <div className="taxi-coords">
          {cafe.lat.toFixed(5)}, {cafe.lng.toFixed(5)}
        </div>
        <div className="taxi-foot">
          <span>谢谢！</span>
          <button onClick={onSaveImage}>
            {t(UI.saveImage)}
            {mode === 'both' && ' 保存图片'}
          </button>
          <button onClick={onClose}>{t(UI.close)}</button>
        </div>
      </div>
    </div>
  )
}
