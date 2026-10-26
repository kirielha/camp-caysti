import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { db, repo } from '../../data'
import { normaliserCode } from '../../data/localRepository'
import { CODES_DEMO, reinitialiserDemo } from '../../data/seed'
import { useCamp } from '../../contexte'

const modeLocal = (import.meta.env.VITE_DATA_BACKEND ?? 'local') === 'local'

export function Connexion() {
  const { eleve, connecter, t } = useCamp()
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string>()
  const [envoi, setEnvoi] = useState(false)
  const naviguer = useNavigate()

  if (eleve) return <Navigate to="/eleve" replace />

  async function entrer(e: FormEvent) {
    e.preventDefault()
    const c = normaliserCode(code)
    if (c.length !== 6) return setErreur(t.codeCourt)
    setEnvoi(true)
    const trouve = await repo.trouverEleveParCode(c)
    setEnvoi(false)
    if (!trouve) return setErreur(t.codeInconnu)
    connecter(trouve)
    naviguer('/eleve')
  }

  return (
    <section className="connexion">
      <h1 className="titre-xl">{t.connexionTitre}</h1>
      <form onSubmit={entrer} noValidate>
        <label htmlFor="code" className="aide">{t.connexionAide}</label>
        <input
          id="code"
          className="champ-code"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 7)); setErreur(undefined) }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={7}
          aria-invalid={!!erreur}
          aria-describedby={erreur ? 'erreur-code' : undefined}
          autoFocus
        />
        {erreur && <p id="erreur-code" className="erreur" role="alert">{erreur}</p>}
        <button className="bouton bouton-principal bouton-large" disabled={envoi}>{t.connexionBouton}</button>
      </form>

      {modeLocal && (
        <aside className="demo">
          <p>{t.demoCodes}</p>
          <div className="demo-codes">
            {CODES_DEMO.map((c) => (
              <button key={c} type="button" className="puce" onClick={() => { setCode(c); setErreur(undefined) }}>{c}</button>
            ))}
          </div>
          <button type="button" className="lien" onClick={async () => { await reinitialiserDemo(db); setCode('') }}>
            {t.reinitialiserDemo}
          </button>
        </aside>
      )}
    </section>
  )
}
