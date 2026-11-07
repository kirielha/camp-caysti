import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { db, modeDemo, repo } from '../../data'
import { ErreurMetier } from '../../data/repository'
import { normaliserCode } from '../../data/localRepository'
import { CODES_DEMO, reinitialiserDemo } from '../../data/seed'
import { useCamp } from '../../contexte'


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
    let trouve
    try {
      trouve = await repo.trouverEleveParCode(c)
    } catch (err) {
      setEnvoi(false)
      const code = err instanceof ErreurMetier ? err.code : undefined
      return setErreur(code === 'trop_essais' ? t.tropEssais : code === 'reseau' ? t.pasDeReseau : t.erreurServeur)
    }
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

      <p className="lien-staff"><Link className="lien lien-discret" to="/formateur">Espace formateur</Link></p>

      {modeDemo && (
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
