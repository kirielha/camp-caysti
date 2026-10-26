import { useCamp } from '../contexte'
import type { Langue } from '../types'

export function Entete() {
  const { langue, changerLangue, enLigne, t } = useCamp()
  return (
    <>
      <header className="entete">
        <span className="marque">
          <svg viewBox="0 0 32 32" aria-hidden="true" className="marque-logo">
            <circle cx="16" cy="16" r="14" fill="var(--bleu)" />
            <path d="M16 6 L19 16 L16 26 L13 16 Z" fill="var(--soleil)" />
            <circle cx="16" cy="16" r="2.5" fill="#fff" />
          </svg>
          {t.appNom}
        </span>
        <div className="langues" role="group" aria-label="Langue / Language">
          {(['fr', 'en'] as Langue[]).map((l) => (
            <button key={l} type="button" aria-pressed={langue === l} onClick={() => changerLangue(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      {!enLigne && <p className="bandeau-hors-ligne" role="status">{t.horsLigne}</p>}
    </>
  )
}
