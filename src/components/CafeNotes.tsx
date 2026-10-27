import { useEffect, useState } from 'react'
import { UI } from '../data/labels'
import { useI18n } from '../lib/i18n'
import { NAME_MAX, NOTE_MAX, NOTE_MIN, noteStore, useCafeNotes, useNotes } from '../lib/notes'

const NAME_KEY = 'shca.notes.name'

function whenText(at: number, zh: boolean) {
  const d = new Date(at)
  return zh
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Props {
  cafeId: string
}

/**
 * The bottom of every café card: what visitors said, and a two-field form to
 * add a line. Posting needs no account; the note shows up at once for its
 * author (marked "awaiting review") and for everyone else after a human okays it.
 */
export function CafeNotes({ cafeId }: Props) {
  const { mode, t } = useI18n()
  const zh = mode !== 'en'
  const notes = useCafeNotes(cafeId)
  const { state } = useNotes()
  const [writing, setWriting] = useState(false)
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<'tooShort' | 'queued' | null>(null)

  useEffect(() => {
    noteStore.start()
  }, [])

  const visible = notes.filter((n) => n.status !== 'rejected')
  const cooldown = noteStore.cooldown(cafeId)

  async function submit() {
    const clean = text.trim()
    if (clean.length < NOTE_MIN) {
      setFlash('tooShort')
      return
    }
    setBusy(true)
    try {
      localStorage.setItem(NAME_KEY, name.trim().slice(0, NAME_MAX))
    } catch {
      // fine
    }
    const outcome = await noteStore.add(cafeId, name, clean)
    setBusy(false)
    setText('')
    setWriting(false)
    setFlash(outcome === 'queued' ? 'queued' : null)
  }

  return (
    <section className="card-notes" aria-label={t(UI.notesTitle)}>
      <div className="section-label">
        {t(UI.notesTitle)}
        {visible.length > 0 && <span className="notes-n"> · {visible.length}</span>}
      </div>

      {visible.length === 0 && state !== 'loading' && <p className="notes-empty">{t(UI.notesNone)}</p>}

      {visible.length > 0 && (
        <ul className="notes-list">
          {visible.map((n) => (
            <li key={n.id} className={`note${n.mine ? ' mine' : ''}${n.status === 'pending' ? ' pending' : ''}`}>
              <p className="note-text">{n.text}</p>
              <div className="note-meta">
                <span className="note-name">{n.name ?? t(UI.notesAnon)}</span>
                <span className="note-when">{whenText(n.at, zh)}</span>
                {n.status === 'pending' && (
                  <span className="note-pending" title={t(UI.notesPendingHint)}>
                    {t(UI.notesPending)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {flash === 'queued' && <p className="notes-flash">{t(UI.notesFailed)}</p>}
      {flash !== 'queued' && state === 'offline' && visible.some((n) => n.mine && n.queued) && (
        <p className="notes-flash">{t(UI.notesLocalOnly)}</p>
      )}

      {!writing ? (
        <button
          type="button"
          className="notes-write"
          onClick={() => {
            setFlash(null)
            setWriting(true)
          }}
          disabled={cooldown > 0}
        >
          {t(UI.notesWrite)}
          {cooldown > 0 && ` · ${Math.ceil(cooldown / 60)} min`}
        </button>
      ) : (
        <form
          className="notes-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <textarea
            className="notes-text"
            value={text}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder={t(UI.notesTextPlaceholder)}
            autoFocus
            onChange={(e) => {
              setText(e.target.value)
              if (flash === 'tooShort') setFlash(null)
            }}
          />
          <div className="notes-row">
            <label className="notes-name">
              <span>{t(UI.notesNameLabel)}</span>
              <input
                type="text"
                value={name}
                maxLength={NAME_MAX}
                placeholder={t(UI.notesNamePlaceholder)}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <span className="notes-count">
              {text.trim().length}/{NOTE_MAX}
            </span>
          </div>
          <p className="notes-rule">
            {t(UI.notesRule)} · {t(UI.notesPhotosSoon)}
          </p>
          {flash === 'tooShort' && <p className="notes-flash">{t(UI.notesTooShort)}</p>}
          <div className="notes-actions">
            <button type="button" className="notes-cancel" onClick={() => setWriting(false)} disabled={busy}>
              {t(UI.notesCancel)}
            </button>
            <button type="submit" className="notes-send" disabled={busy}>
              {busy ? t(UI.notesSending) : t(UI.notesSend)}
            </button>
          </div>
        </form>
      )}
      {writing && <p className="notes-hint">{t(UI.notesPendingHint)}</p>}
    </section>
  )
}
