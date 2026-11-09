import { useEffect, useRef, useState } from 'react'
import type { Ressource } from '../types'

/** Copie un texte : API presse-papiers, sinon ancienne méthode (tablettes anciennes, http). */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texte)
      return true
    }
  } catch { /* on tente l'autre méthode */ }
  const zone = document.createElement('textarea')
  zone.value = texte
  zone.setAttribute('readonly', '')
  zone.style.position = 'fixed'
  zone.style.opacity = '0'
  document.body.appendChild(zone)
  zone.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  zone.remove()
  return ok
}

/** Un code source à copier en un geste. */
export function BlocCode({ r, libelles }: { r: Ressource; libelles: { copier: string; copie: string; copieImpossible: string } }) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos')
  const pre = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (etat === 'repos') return
    const id = setTimeout(() => setEtat('repos'), 2500)
    return () => clearTimeout(id)
  }, [etat])

  const copier = async () => {
    const ok = await copierTexte(r.contenu)
    setEtat(ok ? 'copie' : 'echec')
    if (!ok && pre.current) {
      // sélectionne le code pour une copie manuelle
      const sel = window.getSelection()
      const plage = document.createRange()
      plage.selectNodeContents(pre.current)
      sel?.removeAllRanges()
      sel?.addRange(plage)
    }
  }

  return (
    <figure className="bloc-code">
      <figcaption className="bloc-code-entete">
        <span className="bloc-code-titre">{r.titre}{r.langage && <span className="bloc-code-langage">{r.langage}</span>}</span>
        <button type="button" className={`bouton bouton-copier${etat === 'copie' ? ' bouton-copier-ok' : ''}`} onClick={copier}>
          {etat === 'copie' ? libelles.copie : libelles.copier}
        </button>
      </figcaption>
      <pre ref={pre} className="bloc-code-contenu" tabIndex={0}><code>{r.contenu}</code></pre>
      <p className="bloc-code-etat" role="status">{etat === 'echec' ? libelles.copieImpossible : ''}</p>
    </figure>
  )
}
