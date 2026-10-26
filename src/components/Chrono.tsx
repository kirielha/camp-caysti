import { useEffect, useRef, useState } from 'react'
import { useCamp } from '../contexte'

/**
 * Jauge de temps d'une question : elle se vide de gauche à droite et
 * passe au corail dans les 5 dernières secondes.
 * Le temps est calculé à partir d'une échéance fixe (et non en décrémentant
 * un compteur), pour rester juste même si l'onglet ralentit.
 */
export function Chrono({ duree, pause, onFin }: { duree: number; pause?: boolean; onFin: () => void }) {
  const { t } = useCamp()
  const echeance = useRef(0)
  const [reste, setReste] = useState(duree * 1000)
  const fini = useRef(false)
  const finRef = useRef(onFin)

  useEffect(() => {
    finRef.current = onFin
  }, [onFin])

  useEffect(() => {
    echeance.current = performance.now() + duree * 1000
  }, [duree])

  useEffect(() => {
    if (pause) return
    const id = setInterval(() => {
      const r = Math.max(0, echeance.current - performance.now())
      setReste(r)
      if (r === 0 && !fini.current) {
        fini.current = true
        clearInterval(id)
        finRef.current()
      }
    }, 200)
    return () => clearInterval(id)
  }, [pause])

  const secondes = Math.ceil(reste / 1000)
  const ratio = reste / (duree * 1000)
  const urgent = secondes <= 5

  return (
    <div className={`chrono${urgent ? ' chrono-urgent' : ''}`}>
      <div className="chrono-piste" aria-hidden="true">
        <div className="chrono-jauge" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <span className="chrono-secondes" role="timer" aria-live={urgent ? 'assertive' : 'off'}>
        {t.secondes(secondes)}
      </span>
    </div>
  )
}
