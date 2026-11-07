import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { modeDemo, staff } from '../data'
import { nomComplet } from '../lib/droits'
import type { Personnel, Role } from '../types'
import { useStaff } from './contexteStaff'

export const libelleRole: Record<Role, string> = {
  super_admin: 'Super-admin CAYSTI',
  admin_camp: 'Admin de camp',
  formateur: 'Formateur',
  lecteur: 'Lecteur',
}

export function ConnexionStaff() {
  const { moi, compte } = useStaff()
  if (moi && moi.roles.length > 0) return <Navigate to="/formateur/groupes" replace />
  if (moi) return <EnAttenteDeRole />
  if (compte === 'sans_profil') return <CreationProfil />
  return modeDemo ? <ComptesDemo /> : <ConnexionEmail />
}

function ComptesDemo() {
  const { connecter } = useStaff()
  const [comptes, setComptes] = useState<Personnel[]>()
  const naviguer = useNavigate()
  useEffect(() => { staff.comptesDemo().then(setComptes) }, [])

  return (
    <section className="connexion-staff">
      <h1 className="titre-l">Espace formateur</h1>
      <p className="aide">
        Démo : choisissez un compte. Avec le serveur Supabase, chaque membre du personnel se connecte avec son adresse e-mail.
      </p>
      <ul className="comptes">
        {comptes?.map((p) => (
          <li key={p.id}>
            <button type="button" className="compte" onClick={() => { connecter(p); naviguer('/formateur/groupes') }}>
              <span className="compte-nom">{nomComplet(p)}</span>
              <span className="compte-role">{p.roles.map((r) => libelleRole[r.role]).join(', ')}</span>
              <span className="compte-email">{p.email}</span>
            </button>
          </li>
        ))}
      </ul>
      <Link className="lien" to="/">Retour à l’espace élève</Link>
    </section>
  )
}

type Vue = 'connexion' | 'inscription' | 'oubli' | 'nouveau_mdp'

function ConnexionEmail() {
  const { recharger } = useStaff()
  const [vue, setVue] = useState<Vue>('connexion')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [erreur, setErreur] = useState<string>()
  const [info, setInfo] = useState<string>()
  const [envoi, setEnvoi] = useState(false)

  // arrivée par le lien « mot de passe oublié » reçu par e-mail
  useEffect(() => {
    let arreter: (() => void) | undefined
    void import('../data/supabase/authPersonnel').then((a) => { arreter = a.surRecuperationMotDePasse(() => setVue('nouveau_mdp')) })
    return () => arreter?.()
  }, [])

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setErreur(undefined); setInfo(undefined); setEnvoi(true)
    const auth = await import('../data/supabase/authPersonnel')
    try {
      if (vue === 'connexion') { await auth.seConnecter(email, mdp); await recharger() }
      if (vue === 'inscription') {
        const aConfirmer = await auth.creerCompte(email, mdp)
        if (aConfirmer) { setInfo('Compte créé. Ouvrez le lien reçu par e-mail pour confirmer votre adresse, puis connectez-vous.'); setVue('connexion') }
        else await recharger()
      }
      if (vue === 'oubli') { await auth.envoyerLienMotDePasse(email); setInfo('Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient d’être envoyé.') }
      if (vue === 'nouveau_mdp') { await auth.changerMotDePasse(mdp); setInfo('Mot de passe changé.'); await recharger() }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'La connexion a échoué.')
    } finally {
      setEnvoi(false)
    }
  }

  const titres: Record<Vue, string> = {
    connexion: 'Espace formateur', inscription: 'Créer mon compte', oubli: 'Mot de passe oublié', nouveau_mdp: 'Nouveau mot de passe',
  }
  const boutons: Record<Vue, string> = {
    connexion: 'Se connecter', inscription: 'Créer mon compte', oubli: 'Recevoir le lien', nouveau_mdp: 'Enregistrer le mot de passe',
  }

  return (
    <section className="connexion-staff">
      <h1 className="titre-l">{titres[vue]}</h1>
      {vue === 'inscription' && (
        <p className="aide">Après la création de votre compte, un admin CAYSTI vous attribuera votre rôle (formateur, admin de camp…).</p>
      )}
      <form className="formulaire bloc-gestion" onSubmit={envoyer}>
        {vue !== 'nouveau_mdp' && (
          <label className="champ-groupe"><span>Adresse e-mail</span>
            <input id="email-personnel" className="champ" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        )}
        {vue !== 'oubli' && (
          <label className="champ-groupe"><span>Mot de passe</span>
            <input id="mdp-personnel" className="champ" type="password" minLength={vue === 'connexion' ? undefined : 8} required
              autoComplete={vue === 'connexion' ? 'current-password' : 'new-password'} value={mdp} onChange={(e) => setMdp(e.target.value)} />
            {vue !== 'connexion' && <small className="aide">8 caractères au moins.</small>}
          </label>
        )}
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
        {info && <p className="message-ok" role="status">{info}</p>}
        <button className="bouton bouton-principal" disabled={envoi}>{boutons[vue]}</button>
      </form>
      <div className="liens-connexion">
        {vue !== 'connexion' && <button type="button" className="lien" onClick={() => setVue('connexion')}>J’ai déjà un compte</button>}
        {vue === 'connexion' && <button type="button" className="lien" onClick={() => setVue('inscription')}>Créer mon compte</button>}
        {vue === 'connexion' && <button type="button" className="lien" onClick={() => setVue('oubli')}>Mot de passe oublié</button>}
      </div>
      <Link className="lien lien-discret" to="/">Retour à l’espace élève</Link>
    </section>
  )
}

function CreationProfil() {
  const { recharger, deconnecter } = useStaff()
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [erreur, setErreur] = useState<string>()

  return (
    <section className="connexion-staff">
      <h1 className="titre-l">Bienvenue</h1>
      <p className="aide">Indiquez votre nom tel qu’il apparaîtra aux autres formateurs.</p>
      <form className="formulaire bloc-gestion" onSubmit={async (e) => {
        e.preventDefault()
        try { await (await import('../data/supabase/authPersonnel')).creerMonProfil(prenom, nom, tel); await recharger() } catch (err) {
          setErreur(err instanceof Error ? err.message.replace(/^droits:/, '') : 'Enregistrement impossible.')
        }
      }}>
        <label className="champ-groupe"><span>Prénom</span><input id="profil-prenom" className="champ" required value={prenom} onChange={(e) => setPrenom(e.target.value)} /></label>
        <label className="champ-groupe"><span>Nom</span><input id="profil-nom" className="champ" required value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        <label className="champ-groupe"><span>Téléphone (facultatif)</span><input id="profil-tel" className="champ" type="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></label>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
        <button className="bouton bouton-principal">Continuer</button>
      </form>
      <button type="button" className="lien lien-discret" onClick={() => void deconnecter()}>Se déconnecter</button>
    </section>
  )
}

function EnAttenteDeRole() {
  const { moi, recharger, deconnecter } = useStaff()
  return (
    <section className="connexion-staff">
      <h1 className="titre-l">Compte créé</h1>
      <p>
        Bonjour {moi?.prenom}. Votre compte ({moi?.email}) est prêt, mais aucun rôle ne vous est encore attribué.
        Demandez à un admin CAYSTI de vous ajouter comme formateur ou admin d’un camp.
      </p>
      <div className="liens-connexion">
        <button type="button" className="bouton" onClick={() => void recharger()}>Vérifier à nouveau</button>
        <button type="button" className="lien" onClick={() => void deconnecter()}>Se déconnecter</button>
      </div>
    </section>
  )
}
