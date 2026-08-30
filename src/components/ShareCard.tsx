import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { Archetype, Cafe } from '../data/types'
import { scoreVerdict } from '../lib/match'
import { ARCHETYPE_LABEL, DISTRICT_ZH } from '../data/labels'

/**
 * Share cards for WeChat. Everything is drawn client-side onto a canvas and
 * handed over as a plain <img>, because in WeChat's browser the way people
 * save things is a long press on an image — not a download button. (The
 * button exists too, for everyone else.)
 */

export type ShareKind = 'cafe' | 'taxi'

interface Props {
  cafe: Cafe
  kind: ShareKind
  score: number | null
  onClose: () => void
}

const W = 750
const PAPER = '#f7efe1'
const PAPER_EDGE = '#efe3cd'
const INK = '#33261a'
const INK_SOFT = '#8a7a63'
const ACCENT = '#b4552d'

/** The same hand-inked marker strokes the map uses, replayed onto canvas. */
const GLYPH_PATHS: Record<Archetype, string[]> = {
  'standing-bar': [
    'M-5.4 3.2 h10.8',
    'M-2.8 -3.6 h5.2 v3.4 a2.6 2.6 0 0 1 -5.2 0 z',
    'M2.4 -2.9 a1.9 1.9 0 0 1 0 3.1',
    'M-0.2 0.8 v2.3',
  ],
  'lane-house': ['M-5.2 0.4 l5.2 -4.4 l5.2 4.4', 'M-3.9 0 v4 h7.8 v-4', 'M-1 4 v-2.6 h2 v2.6'],
  roastery: [
    'M-4.4 0 a4.4 4.4 0 1 0 8.8 0 a4.4 4.4 0 1 0 -8.8 0',
    'M-2.2 1.4 a2.4 2.4 0 0 1 2.2 -3.4 a2.4 2.4 0 0 1 1.6 4',
    'M-5.6 4.6 h11.2',
  ],
  garden: ['M0 4.6 v-4', 'M0 0.6 a3.6 3.2 0 1 1 0.1 0 z', 'M-2 2.2 l2 -1.4 l2 1.4'],
  laboratory: [
    'M-1.5 -4.4 h3',
    'M-0.9 -4.2 v3.1 l-3.1 4.6 a1.4 1.4 0 0 0 1.2 2.2 h5.6 a1.4 1.4 0 0 0 1.2 -2.2 l-3.1 -4.6 v-3.1',
    'M-2.6 1.6 h5.2',
  ],
  gallery: [
    'M-4.6 -4.2 h9.2 v8.4 h-9.2 z',
    'M-3 2.2 l2.6 -3.4 l1.9 2.2 l1.4 -1.4 l1.3 2.6',
    'M1.3 -2 a0.9 0.9 0 1 0 1.8 0 a0.9 0.9 0 1 0 -1.8 0',
  ],
  riverside: [
    'M-5.2 -1.6 q2.6 -2.2 5.2 0 q2.6 2.2 5.2 0',
    'M-5.2 1.6 q2.6 -2.2 5.2 0 q2.6 2.2 5.2 0',
    'M-5.2 4.4 q2.6 -2.2 5.2 0 q2.6 2.2 5.2 0',
  ],
  neighborhood: [
    'M-3.6 -2.6 h6.2 v3.6 a3.1 3.1 0 0 1 -6.2 0 z',
    'M2.6 -1.8 a2 2 0 0 1 0 3.4',
    'M-5.4 4.4 h10.4',
  ],
  bakery: ['M-4.8 2.6 a5.4 5.4 0 0 1 9.6 0', 'M-2.2 2.6 a3 4.4 0 0 1 4.4 0', 'M-4.8 2.6 h9.6'],
  'hidden-door': [
    'M-3.6 4.4 v-5.2 a3.6 3.6 0 0 1 7.2 0 v5.2 z',
    'M-1.2 0.4 a1.2 1.2 0 1 0 2.4 0 a1.2 1.2 0 1 0 -2.4 0',
    'M0 1.6 v1.6',
  ],
}

function deepLink(cafe: Cafe): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/cafe=${cafe.id}`
}

function serif(px: number, weight = 600) {
  return `${weight} ${px}px Fraunces, 'Noto Serif SC', serif`
}
function zhSerif(px: number, weight = 400) {
  return `${weight} ${px}px 'Noto Serif SC', Fraunces, serif`
}
function sans(px: number, weight = 400) {
  return `${weight} ${px}px Karla, sans-serif`
}

/** A slightly unsteady rectangle — ruled by hand, not by machine. */
function inkFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const j = (n: number) => n + (Math.sin(n * 12.9898) * 43758.5453) % 1.6 - 0.8
  ctx.beginPath()
  ctx.moveTo(j(x), j(y))
  ctx.lineTo(j(x + w), j(y))
  ctx.lineTo(j(x + w), j(y + h))
  ctx.lineTo(j(x), j(y + h))
  ctx.closePath()
  ctx.stroke()
}

function paper(ctx: CanvasRenderingContext2D, h: number) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, h)
  const g = ctx.createRadialGradient(W / 2, h / 2, h / 4, W / 2, h / 2, h)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(90,66,40,0.10)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, h)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.5
  inkFrame(ctx, 26, 26, W - 52, h - 52)
  ctx.strokeStyle = PAPER_EDGE
  ctx.lineWidth = 1.5
  inkFrame(ctx, 36, 36, W - 72, h - 72)
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  archetype: Archetype,
  cx: number,
  cy: number,
  scale: number,
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.arc(0, 0, 8.4, 0, Math.PI * 2)
  ctx.stroke()
  for (const d of GLYPH_PATHS[archetype]) ctx.stroke(new Path2D(d))
  ctx.restore()
}

async function qrOnto(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
) {
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, text, {
    width: size,
    margin: 1,
    color: { dark: INK, light: '#00000000' },
  })
  ctx.drawImage(qr, x, y, size, size)
}

async function ensureFonts() {
  if (!('fonts' in document)) return
  try {
    await Promise.all([
      document.fonts.load(serif(48)),
      document.fonts.load(serif(48, 800)),
      document.fonts.load(zhSerif(36)),
      document.fonts.load(zhSerif(36, 600)),
      document.fonts.load(sans(24)),
      document.fonts.load(sans(24, 600)),
    ])
  } catch {
    // system serif is a fine understudy
  }
}

async function drawCafeCard(cafe: Cafe, score: number | null): Promise<string> {
  const H = 1000
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas context')
  await ensureFonts()
  paper(ctx, H)

  ctx.fillStyle = INK_SOFT
  ctx.font = sans(22, 600)
  ctx.textAlign = 'center'
  ctx.fillText('THE SHANGHAI COFFEE ATLAS · 上海咖啡地图集', W / 2, 92)

  drawGlyph(ctx, cafe.archetype, W / 2, 190, 6.5)

  ctx.fillStyle = INK_SOFT
  ctx.font = sans(22)
  ctx.fillText(
    `${ARCHETYPE_LABEL[cafe.archetype].en} · ${ARCHETYPE_LABEL[cafe.archetype].zh}`,
    W / 2,
    286,
  )

  ctx.fillStyle = INK
  ctx.font = serif(54, 800)
  ctx.fillText(cafe.name, W / 2, 356, W - 120)
  ctx.font = zhSerif(38, 600)
  ctx.fillText(cafe.nameZh, W / 2, 412, W - 120)

  ctx.fillStyle = INK_SOFT
  ctx.font = sans(24)
  ctx.fillText(
    `${cafe.street} · ${cafe.district}  /  ${cafe.streetZh} · ${DISTRICT_ZH[cafe.district]}`,
    W / 2,
    466,
    W - 120,
  )

  ctx.strokeStyle = INK_SOFT
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(120, 506)
  ctx.lineTo(W - 120, 508)
  ctx.stroke()

  if (score !== null) {
    ctx.fillStyle = ACCENT
    ctx.font = serif(64, 800)
    ctx.fillText(String(score), W / 2 - 90, 592)
    ctx.fillStyle = INK
    ctx.font = serif(34)
    ctx.textAlign = 'left'
    ctx.fillText(scoreVerdict(score), W / 2 - 40, 580)
    ctx.fillStyle = INK_SOFT
    ctx.font = sans(21)
    ctx.fillText('against my compass', W / 2 - 40, 608)
    ctx.textAlign = 'center'
  } else {
    ctx.fillStyle = INK
    ctx.font = serif(34)
    ctx.fillText(`“${cafe.signature}”`, W / 2, 585, W - 140)
  }

  ctx.fillStyle = INK
  ctx.font = zhSerif(26)
  if (score !== null) {
    ctx.fillText(`“${cafe.signature}”`, W / 2, 668, W - 140)
  }

  await qrOnto(ctx, deepLink(cafe), W / 2 - 90, 712, 180)
  ctx.fillStyle = INK_SOFT
  ctx.font = sans(21)
  ctx.fillText('Scan for the atlas page · 扫码看地图集', W / 2, 936)

  return canvas.toDataURL('image/png')
}

async function drawTaxiCard(cafe: Cafe): Promise<string> {
  const H = 560
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas context')
  await ensureFonts()
  paper(ctx, H)

  ctx.textAlign = 'center'
  ctx.fillStyle = INK_SOFT
  ctx.font = zhSerif(30)
  ctx.fillText('师傅，请带我去这里', W / 2, 110)

  ctx.fillStyle = INK
  ctx.font = zhSerif(66, 600)
  ctx.fillText(cafe.nameZh, W / 2, 210, W - 120)

  ctx.font = zhSerif(40)
  ctx.fillText(`${cafe.streetZh}，${DISTRICT_ZH[cafe.district]}区`, W / 2, 286, W - 120)

  ctx.fillStyle = INK_SOFT
  ctx.font = sans(26)
  ctx.fillText(`${cafe.name} · ${cafe.street}, ${cafe.district}`, W / 2, 348, W - 120)
  ctx.font = sans(24)
  ctx.fillText(`${cafe.lat.toFixed(5)}, ${cafe.lng.toFixed(5)}`, W / 2, 392)

  ctx.font = zhSerif(28)
  ctx.fillStyle = INK
  ctx.fillText('谢谢！', W / 2, 476)

  return canvas.toDataURL('image/png')
}

export function ShareCardModal({ cafe, kind, score, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const run = useRef(0)

  useEffect(() => {
    const id = ++run.current
    setDataUrl(null)
    setError(false)
    const draw = kind === 'taxi' ? drawTaxiCard(cafe) : drawCafeCard(cafe, score)
    draw
      .then((url) => {
        if (run.current === id) setDataUrl(url)
      })
      .catch(() => {
        if (run.current === id) setError(true)
      })
  }, [cafe, kind, score])

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="sharecard" onClick={(e) => e.stopPropagation()}>
        <div className="sc-head">
          <strong>
            {kind === 'taxi' ? 'Taxi card as an image' : 'Share card'}
            <span className="zh"> · {kind === 'taxi' ? '出租车卡图片' : '分享卡片'}</span>
          </strong>
          <button className="card-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {error && <p className="sc-hint">The inkwell ran dry — try again.</p>}
        {!dataUrl && !error && <p className="sc-hint">Inking…</p>}
        {dataUrl && (
          <>
            <img
              className="sc-img"
              src={dataUrl}
              alt={`${cafe.name} ${kind === 'taxi' ? 'taxi card' : 'share card'}`}
            />
            <p className="sc-hint">
              Long-press the image to save · 长按图片保存到相册
            </p>
            <a
              className="sc-save"
              href={dataUrl}
              download={`${cafe.id}-${kind === 'taxi' ? 'taxi' : 'share'}.png`}
            >
              Save image · 保存图片
            </a>
          </>
        )}
      </div>
    </div>
  )
}
