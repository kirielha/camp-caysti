// Espace élève branché sur Supabase : chaque méthode appelle une fonction SQL
// (supabase/migrations/0005_api.sql) qui vérifie les droits et fait la notation.

import { nouvelId } from '../../lib/ids'
import type { AtelierPourEleve, EtatPilote, Reponse } from '../../types'
import { ErreurMetier, type Repository } from '../repository'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appeler, assurerSessionEleve, clientEleve, clientPersonnel } from './client'
import { enAttente, mettreEnAttente, vider, type ReponseEnAttente } from './fileReponses'

const RAFRAICHISSEMENT_MS = 4000

/** État d'une partie pilotée, avec l'écart d'horloge entre le serveur et l'appareil. */
export async function etatPilote(client: SupabaseClient, sessionId: string): Promise<EtatPilote> {
  const avant = Date.now()
  const e = await appeler<EtatPilote & { maintenant: string }>(client, 'etat_pilote', { p_session: sessionId })
  const milieu = (avant + Date.now()) / 2
  const { maintenant, ...etat } = e
  return { ...etat, decalage_ms: Date.parse(maintenant) - milieu }
}

/**
 * Temps réel : le serveur prévient à chaque changement de la session (voir notifier_session).
 * En secours (réseau instable, canal coupé), l'écran se rafraîchit aussi toutes les 4 secondes.
 */
export function surveiller(client: SupabaseClient, sessionId: string, auChangement: () => void) {
  const canal = client.channel(`session:${sessionId}`).on('broadcast', { event: 'changement' }, () => auChangement()).subscribe()
  const minuterie = setInterval(auChangement, RAFRAICHISSEMENT_MS)
  const auRetour = () => auChangement()
  window.addEventListener('online', auRetour)
  return () => {
    clearInterval(minuterie)
    window.removeEventListener('online', auRetour)
    void client.removeChannel(canal)
  }
}

export function creerRepositorySupabase(): Repository {
  const c = () => clientEleve()
  const rpc = <T>(fonction: string, args: Record<string, unknown> = {}) => appeler<T>(c(), fonction, args)

  const envoyer = async (r: ReponseEnAttente) => {
    await rpc('enregistrer_reponse', { p_tentative: r.tentativeId, p_question: r.questionId, p_choix: r.choix_coches, p_texte: r.texte ?? null, p_temps_ms: Math.round(r.temps_ms) })
  }
  // dès que le réseau revient, les réponses gardées sur la tablette partent
  if (typeof window !== 'undefined') window.addEventListener('online', () => { void vider(envoyer) })

  const repo: Repository = {
    async trouverEleveParCode(code) {
      await assurerSessionEleve()
      return (await rpc('connexion_eleve', { p_code: code })) ?? undefined
    },

    async changerLangueEleve(_eleveId, langue) {
      await rpc('changer_langue', { p_langue: langue })
    },

    async ateliersPourEleve() {
      return rpc<AtelierPourEleve[]>('ateliers_eleve')
    },

    async sessionsPourEleve() {
      return (await repo.ateliersPourEleve('')).flatMap((a) => a.activites)
    },

    async progression(sessionId) {
      return rpc('progression', { p_session: sessionId })
    },

    async chargerSession(sessionId) {
      return rpc('charger_session', { p_session: sessionId })
    },

    async demarrerTentative(sessionId, _eleveId, langue) {
      const r = await rpc<{ tentative: never; reponses: Reponse[] }>('demarrer_tentative', { p_session: sessionId, p_langue: langue })
      // réponses données hors ligne et pas encore parties : l'élève les retrouve à la reprise
      const locales = enAttente().filter((x) => x.tentativeId === (r.tentative as { id: string }).id)
      for (const l of locales) {
        if (!r.reponses.some((x) => x.question_id === l.questionId)) {
          r.reponses.push({ id: nouvelId(), tentative_id: l.tentativeId, question_id: l.questionId, choix_coches: l.choix_coches, texte: l.texte, temps_ms: l.temps_ms, statut_correction: 'en_attente' })
        }
      }
      return r
    },

    async enregistrerReponse(tentativeId, questionId, saisie) {
      const attente: ReponseEnAttente = { tentativeId, questionId, choix_coches: saisie.choix_coches, texte: saisie.texte, temps_ms: saisie.temps_ms }
      try {
        await vider(envoyer, tentativeId)
        return await rpc<Reponse>('enregistrer_reponse', {
          p_tentative: tentativeId, p_question: questionId, p_choix: saisie.choix_coches, p_texte: saisie.texte ?? null, p_temps_ms: Math.round(saisie.temps_ms),
        })
      } catch (e) {
        if (!(e instanceof ErreurMetier && e.code === 'reseau')) throw e
        // hors ligne : la réponse est gardée et l'élève continue ; le serveur la notera à l'envoi
        mettreEnAttente(attente)
        return { id: nouvelId(), tentative_id: tentativeId, question_id: questionId, choix_coches: saisie.choix_coches, texte: saisie.texte, temps_ms: saisie.temps_ms, statut_correction: 'en_attente' }
      }
    },

    async soumettreTentative(tentativeId) {
      if (!(await vider(envoyer, tentativeId))) throw new ErreurMetier('reseau', 'Réponses pas encore envoyées')
      return rpc('soumettre_tentative', { p_tentative: tentativeId })
    },

    async tentativeDe(sessionId) {
      return (await rpc('tentative_de', { p_session: sessionId })) ?? undefined
    },

    async rejoindreSessionPilotee(sessionId, _eleveId, langue) {
      return rpc('rejoindre_pilote', { p_session: sessionId, p_langue: langue })
    },

    async repondrePilote(tentativeId, questionId, saisie) {
      return rpc('repondre_pilote', { p_tentative: tentativeId, p_question: questionId, p_choix: saisie.choix_coches, p_texte: saisie.texte ?? null })
    },

    etatPilote: (sessionId) => etatPilote(c(), sessionId),

    async classementEnDirect(sessionId, limite = 10) {
      return rpc('classement_en_direct', { p_session: sessionId, p_limite: limite })
    },

    surveillerSession: (sessionId, auChangement) => surveiller(c(), sessionId, auChangement),

    async classement(sessionId, limite = 10) {
      return rpc('classement', { p_session: sessionId, p_limite: limite })
    },

    async changerStatutGroupe(groupeId, statut) {
      await appeler(clientPersonnel(), 'changer_statut_groupe', { p_groupe: groupeId, p_statut: statut })
    },

    async changerStatutSession(sessionId, statut) {
      await appeler(clientPersonnel(), 'changer_statut_session', { p_session: sessionId, p_statut: statut })
    },

    async fiche(ficheId) {
      return (await appeler<{ fiche: never }>(clientPersonnel(), 'charger_fiche', { p_fiche: ficheId })).fiche
    },
  }
  return repo
}
