import { useEffect, useRef, useState } from 'react'

/**
 * Chronomètre du mode piloté : le temps restant est calculé à partir de l'heure à laquelle
 * le formateur a lancé la question, si bien que tous les écrans affichent le même décompte,
 * même pour un élève qui recharge la page en cours de question.
 */
export function ChronoPartage({ lanceeLe, duree, onFin, libelle, decalage = 0 }: {
  lanceeLe: string
  duree: number
  onFin?: () => void
  libelle: (secondes: number) => string
  /** Écart entre l'horloge du serveur et celle de l'appareil : une tablette mal réglée affiche quand même le bon temps. */
  decalage?: number
}) {
  // échéance exprimée dans l'horloge de l'appareil
  const fin = Date.parse(lanceeLe) + duree * 1000 - decalage
  const [reste, setReste] = useState(() => Math.max(0, fin - Date.now()))
  const prevenu = useRef(false)
  const onFinRef = useRef(onFin)
  useEffect(() => { onFinRef.current = onFin }, [onFin])

  useEffect(() => {
    prevenu.current = false
    const tic = () => {
      const r = Math.max(0, fin - Date.now())
      setReste(r)
      if (r === 0 && !prevenu.current) { prevenu.current = true; onFinRef.current?.() }
    }
    tic()
    const id = setInterval(tic, 200)
    return () => clearInterval(id)
  }, [fin])

  const secondes = Math.ceil(reste / 1000)
  const urgent = secondes <= 5
  return (
    <div className={`chrono${urgent ? ' chrono-urgent' : ''}`}>
      <div className="chrono-piste" aria-hidden="true">
        <div className="chrono-jauge" style={{ transform: `scaleX(${reste / (duree * 1000)})` }} />
      </div>
      <span className="chrono-secondes" role="timer" aria-live={urgent ? 'assertive' : 'off'}>{libelle(secondes)}</span>
    </div>
  )
}
