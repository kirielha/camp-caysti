import { estAdmin, estAdminCamp, ficheVisible, nomComplet, peutModifierFiche, peutProgrammer, peutValider } from '../lib/droits'
import { nouvelId } from '../lib/ids'
import { totaliser } from '../lib/scoring'
import type { Choix, Eleve, Fiche, GroupePourFormateur, Personnel, Question, Utilisateur } from '../types'
import type { BaseCamp } from './db'
import { ErreurDroits, type FicheEditable, type StaffRepository } from './staffRepository'

const maintenant = () => new Date().toISOString()

export function creerStaffRepositoryLocal(db: BaseCamp): StaffRepository {
  async function personnel(id: string): Promise<Personnel | undefined> {
    const u = await db.utilisateur.get(id)
    if (!u) return undefined
    return { ...u, roles: await db.attribution_role.where('utilisateur_id').equals(id).toArray() }
  }

  async function contexteGroupe(groupeId: string) {
    const groupe = await db.groupe.get(groupeId)
    const atelier = groupe && (await db.atelier.get(groupe.atelier_id))
    const technologie = atelier && (await db.technologie.get(atelier.technologie_id))
    const camp = atelier && (await db.camp.get(atelier.camp_id))
    if (!groupe || !atelier || !technologie || !camp) throw new Error(`Groupe introuvable : ${groupeId}`)
    return { groupe, atelier, technologie, camp }
  }

  /** Le formateur affecté au groupe ou un admin du camp peut piloter le groupe. */
  async function verifierPilotage(groupeId: string, p: Personnel) {
    const { camp } = await contexteGroupe(groupeId)
    if (estAdminCamp(p, camp.id)) return
    const affecte = await db.groupe_formateur.where('groupe_id').equals(groupeId).filter((g) => g.utilisateur_id === p.id).count()
    if (!affecte) throw new ErreurDroits('Ce groupe n’est pas le vôtre')
  }

  async function groupeDeSession(sessionId: string) {
    const s = await db.session_evaluation.get(sessionId)
    if (!s) throw new Error(`Session introuvable : ${sessionId}`)
    return s
  }

  async function verifierModificationFiche(ficheId: string, p: Personnel) {
    const f = await db.fiche.get(ficheId)
    if (!f) throw new Error(`Fiche introuvable : ${ficheId}`)
    if (!peutModifierFiche(f, p)) throw new ErreurDroits('Vous ne pouvez pas modifier cette fiche')
    return f
  }

  async function nbQuestions(ficheId: string) {
    return db.fiche_question.where('fiche_id').equals(ficheId).count()
  }

  const repo: StaffRepository = {
    async comptesDemo() {
      const tous = await db.utilisateur.toArray()
      const avecRoles = await Promise.all(tous.filter((u) => u.actif).map((u) => personnel(u.id)))
      return avecRoles.filter((p): p is Personnel => !!p)
    },

    personnel,

    // ---------------------------------------------------------------- Pilotage
    async groupesPour(p) {
      let liens: { groupe_id: string; role?: 'principal' | 'secondaire' }[]
      if (estAdmin(p)) {
        const camps = p.roles.some((r) => r.role === 'super_admin' || (r.role === 'admin_camp' && !r.camp_id))
          ? undefined
          : p.roles.filter((r) => r.role === 'admin_camp').map((r) => r.camp_id)
        const ateliers = await db.atelier.toArray()
        const ids = new Set(ateliers.filter((a) => !camps || camps.includes(a.camp_id)).map((a) => a.id))
        const groupes = (await db.groupe.toArray()).filter((g) => ids.has(g.atelier_id))
        const mesRoles = await db.groupe_formateur.where('utilisateur_id').equals(p.id).toArray()
        liens = groupes.map((g) => ({ groupe_id: g.id, role: mesRoles.find((m) => m.groupe_id === g.id)?.role }))
      } else {
        liens = (await db.groupe_formateur.where('utilisateur_id').equals(p.id).toArray()).map((g) => ({ groupe_id: g.groupe_id, role: g.role }))
      }
      const resultats: GroupePourFormateur[] = await Promise.all(
        liens.map(async (l) => ({
          ...(await contexteGroupe(l.groupe_id)),
          role: l.role,
          nb_eleves: await db.inscription.where('groupe_id').equals(l.groupe_id).count(),
        })),
      )
      return resultats.sort((a, b) =>
        `${a.groupe.date} ${a.groupe.heure_debut}`.localeCompare(`${b.groupe.date} ${b.groupe.heure_debut}`))
    },

    async detailGroupe(groupeId, p) {
      const ctx = await contexteGroupe(groupeId)
      const affectations = await db.groupe_formateur.where('groupe_id').equals(groupeId).toArray()
      const formateurs = (await Promise.all(affectations.map(async (a) => {
        const utilisateur = await db.utilisateur.get(a.utilisateur_id)
        return utilisateur && { utilisateur, role: a.role }
      }))).filter((f): f is { utilisateur: Utilisateur; role: 'principal' | 'secondaire' } => !!f)
        .sort((a, b) => (a.role === 'principal' ? -1 : 1) - (b.role === 'principal' ? -1 : 1))

      const inscriptions = await db.inscription.where('groupe_id').equals(groupeId).toArray()
      const eleves = (await db.eleve.bulkGet(inscriptions.map((i) => i.eleve_id)))
        .filter((e): e is Eleve => !!e)
        .sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom))

      const sessions = await db.session_evaluation.where('groupe_id').equals(groupeId).toArray()
      const ordre = { pretest: 0, quiz: 1, posttest: 2, satisfaction: 3 }
      const activites = (await Promise.all(sessions.map(async (session) => {
        const fiche = await db.fiche.get(session.fiche_id)
        if (!fiche) return undefined
        const tentatives = await db.tentative.where('session_id').equals(session.id).toArray()
        return {
          session, fiche,
          nb_questions: await nbQuestions(fiche.id),
          nb_soumises: tentatives.filter((t) => t.statut !== 'en_cours').length,
          nb_en_cours: tentatives.filter((t) => t.statut === 'en_cours').length,
        }
      }))).filter((a): a is NonNullable<typeof a> => !!a)
        .sort((a, b) => ordre[a.fiche.type] - ordre[b.fiche.type])

      const role = affectations.find((a) => a.utilisateur_id === p.id)?.role
      return { ...ctx, role, nb_eleves: eleves.length, formateurs, eleves, activites }
    },

    async resultatsSession(sessionId) {
      const session = await groupeDeSession(sessionId)
      const inscriptions = await db.inscription.where('groupe_id').equals(session.groupe_id).toArray()
      const lignes = await Promise.all(inscriptions.map(async (i) => {
        const eleve = await db.eleve.get(i.eleve_id)
        if (!eleve) return undefined
        const tentative = await db.tentative.where('[session_id+eleve_id]').equals([sessionId, eleve.id]).first()
        const en_attente = tentative
          ? await db.reponse.where('tentative_id').equals(tentative.id).filter((r) => r.statut_correction === 'en_attente').count()
          : 0
        return { eleve, tentative, en_attente }
      }))
      const rang = (l: { tentative?: { statut: string } }) => (!l.tentative ? 2 : l.tentative.statut === 'en_cours' ? 1 : 0)
      return lignes
        .filter((l): l is NonNullable<typeof l> => !!l)
        .sort((a, b) =>
          rang(a) - rang(b)
          || (b.tentative?.score ?? 0) - (a.tentative?.score ?? 0)
          || (a.tentative?.temps_total_ms ?? 0) - (b.tentative?.temps_total_ms ?? 0)
          || a.eleve.nom.localeCompare(b.eleve.nom))
    },

    async changerStatutGroupe(groupeId, statut, p) {
      await verifierPilotage(groupeId, p)
      await db.groupe.update(groupeId, { statut })
    },

    async changerStatutSession(sessionId, statut, p) {
      const s = await groupeDeSession(sessionId)
      await verifierPilotage(s.groupe_id, p)
      await db.session_evaluation.update(sessionId, {
        statut,
        ...(statut === 'ouverte' ? { ouverte_le: maintenant(), lancee_par: p.id } : {}),
        ...(statut === 'fermee' ? { fermee_le: maintenant() } : {}),
      })
      // À la fermeture, les tentatives commencées mais non terminées sont closes en l'état.
      if (statut === 'fermee') {
        const enCours = await db.tentative.where('session_id').equals(sessionId).filter((t) => t.statut === 'en_cours').toArray()
        for (const t of enCours) {
          const reponses = await db.reponse.where('tentative_id').equals(t.id).toArray()
          const fq = await db.fiche_question.where('fiche_id').equals(s.fiche_id).toArray()
          const questions = (await db.question.bulkGet(fq.map((l) => l.question_id))).filter((q): q is Question => !!q)
          const tot = totaliser(questions, reponses)
          await db.tentative.update(t.id, { statut: 'expiree', fin: maintenant(), score: tot.score, score_max: tot.score_max, temps_total_ms: tot.temps_total_ms })
        }
      }
    },

    async changerAffichageClassement(sessionId, affiche, p) {
      const s = await groupeDeSession(sessionId)
      await verifierPilotage(s.groupe_id, p)
      await db.session_evaluation.update(sessionId, { classement_affiche: affiche })
    },

    async ajouterActivite(groupeId, ficheId, p) {
      await verifierPilotage(groupeId, p)
      const fiche = await db.fiche.get(ficheId)
      if (!fiche) throw new Error('Fiche introuvable')
      if (!peutProgrammer(fiche, p)) throw new ErreurDroits('Cette fiche doit d’abord être validée par un admin')
      await db.session_evaluation.add({
        id: nouvelId(), fiche_id: ficheId, groupe_id: groupeId, mode: 'libre', mode_correction: fiche.mode_correction,
        statut: 'brouillon', classement_affiche: fiche.type !== 'satisfaction', etape: 'attente',
      })
    },

    async retirerActivite(sessionId, p) {
      const s = await groupeDeSession(sessionId)
      await verifierPilotage(s.groupe_id, p)
      const tentatives = await db.tentative.where('session_id').equals(sessionId).count()
      if (tentatives > 0) throw new ErreurDroits('Des élèves ont déjà commencé cette activité : fermez-la plutôt que de la retirer')
      await db.session_evaluation.delete(sessionId)
    },

    // ---------------------------------------------------------------- Banque de fiches
    async fichesVisibles(p) {
      const fiches = (await db.fiche.toArray()).filter((f) => ficheVisible(f, p))
      return Promise.all(fiches.map(async (fiche) => {
        const auteur = await db.utilisateur.get(fiche.auteur_id)
        return {
          fiche,
          auteur: auteur ? nomComplet(auteur) : '—',
          technologie: fiche.technologie_id ? await db.technologie.get(fiche.technologie_id) : undefined,
          nb_questions: await nbQuestions(fiche.id),
          nb_sessions: await db.session_evaluation.where('fiche_id').equals(fiche.id).count(),
        }
      }))
    },

    async chargerFiche(ficheId) {
      const fiche = await db.fiche.get(ficheId)
      if (!fiche) throw new Error(`Fiche introuvable : ${ficheId}`)
      const liens = (await db.fiche_question.where('fiche_id').equals(ficheId).toArray()).sort((a, b) => a.ordre - b.ordre)
      const questions = await Promise.all(liens.map(async (l) => {
        const q = (await db.question.get(l.question_id))!
        const choix = (await db.choix.where('question_id').equals(q.id).toArray()).sort((a, b) => a.ordre - b.ordre)
        return { ...q, choix }
      }))
      return { fiche, questions }
    },

    async enregistrerFiche({ fiche, questions }: FicheEditable, p) {
      const existante = await db.fiche.get(fiche.id)
      if (existante && !peutModifierFiche(existante, p)) throw new ErreurDroits('Vous ne pouvez pas modifier cette fiche')
      const utilisee = existante ? await db.session_evaluation.where('fiche_id').equals(fiche.id).count() : 0
      if (utilisee && !estAdmin(p)) {
        // modifier une fiche déjà passée par des élèves fausserait la comparaison de leurs résultats
        const tentatives = await db.tentative.where('session_id').anyOf(
          (await db.session_evaluation.where('fiche_id').equals(fiche.id).toArray()).map((s) => s.id)).count()
        if (tentatives) throw new ErreurDroits('Des élèves ont déjà passé cette fiche : dupliquez-la pour la modifier')
      }

      await db.transaction('rw', [db.fiche, db.question, db.choix, db.fiche_question], async () => {
        const aSauver: Fiche = existante
          ? { ...existante, ...fiche, auteur_id: existante.auteur_id }
          : { ...fiche, auteur_id: p.id, statut_validation: 'brouillon', version: 1 }
        // Une fiche modifiée après refus repasse en brouillon
        if (existante?.statut_validation === 'refusee') aSauver.statut_validation = 'brouillon'
        await db.fiche.put(aSauver)

        const anciens = await db.fiche_question.where('fiche_id').equals(fiche.id).toArray()
        const gardees = new Set(questions.map((q) => q.id))
        for (const l of anciens) {
          if (!gardees.has(l.question_id)) {
            await db.fiche_question.delete([l.fiche_id, l.question_id])
            // la question n'est plus utilisée nulle part : on la supprime
            if (!(await db.fiche_question.filter((x) => x.question_id === l.question_id).count())) {
              await db.choix.where('question_id').equals(l.question_id).delete()
              await db.question.delete(l.question_id)
            }
          }
        }
        for (const [ordre, q] of questions.entries()) {
          const { choix, ...question } = q
          const avant = await db.question.get(q.id)
          await db.question.put({ ...question, auteur_id: avant?.auteur_id ?? p.id } as Question)
          await db.choix.where('question_id').equals(q.id).delete()
          await db.choix.bulkPut(choix.map((c, i): Choix => ({ ...c, question_id: q.id, ordre: i })))
          await db.fiche_question.put({ fiche_id: fiche.id, question_id: q.id, ordre })
        }
      })
      return fiche.id
    },

    async dupliquerFiche(ficheId, p) {
      const { fiche, questions } = await repo.chargerFiche(ficheId)
      const id = nouvelId()
      const copie: FicheEditable = {
        fiche: {
          ...fiche, id, auteur_id: p.id, titre_fr: `${fiche.titre_fr} (copie)`, titre_en: fiche.titre_en && `${fiche.titre_en} (copy)`,
          visibilite: 'privee', statut_validation: 'brouillon', version: 1,
          validee_par: undefined, validee_le: undefined, commentaire_validation: undefined,
        },
        questions: questions.map((q) => {
          const qid = nouvelId()
          return { ...q, id: qid, choix: q.choix.map((c) => ({ ...c, id: nouvelId(), question_id: qid })) }
        }),
      }
      return repo.enregistrerFiche(copie, p)
    },

    async soumettreFiche(ficheId, p) {
      const f = await verifierModificationFiche(ficheId, p)
      if ((await nbQuestions(ficheId)) === 0) throw new ErreurDroits('Ajoutez au moins une question avant de soumettre')
      await db.fiche.update(f.id, { statut_validation: 'soumise', commentaire_validation: undefined })
    },

    async validerFiche(ficheId, p) {
      if (!peutValider(p)) throw new ErreurDroits('Seul un admin peut valider une fiche')
      await db.fiche.update(ficheId, {
        statut_validation: 'validee', visibilite: 'officielle', validee_par: p.id, validee_le: maintenant(), commentaire_validation: undefined,
      })
    },

    async refuserFiche(ficheId, commentaire, p) {
      if (!peutValider(p)) throw new ErreurDroits('Seul un admin peut refuser une fiche')
      if (!commentaire.trim()) throw new ErreurDroits('Expliquez à l’auteur ce qu’il faut corriger')
      await db.fiche.update(ficheId, { statut_validation: 'refusee', commentaire_validation: commentaire.trim() })
    },

    async supprimerFiche(ficheId, p) {
      await verifierModificationFiche(ficheId, p)
      if (await db.session_evaluation.where('fiche_id').equals(ficheId).count()) {
        throw new ErreurDroits('Cette fiche est programmée dans un groupe : retirez-la d’abord')
      }
      await db.transaction('rw', [db.fiche, db.question, db.choix, db.fiche_question], async () => {
        const liens = await db.fiche_question.where('fiche_id').equals(ficheId).toArray()
        await db.fiche_question.where('fiche_id').equals(ficheId).delete()
        for (const l of liens) {
          if (!(await db.fiche_question.filter((x) => x.question_id === l.question_id).count())) {
            await db.choix.where('question_id').equals(l.question_id).delete()
            await db.question.delete(l.question_id)
          }
        }
        await db.fiche.delete(ficheId)
      })
    },

    // ---------------------------------------------------------------- Référentiels
    async technologies() {
      return (await db.technologie.toArray()).sort((a, b) => a.nom_fr.localeCompare(b.nom_fr))
    },
    async competences(technologieId) {
      const toutes = technologieId ? await db.competence.where('technologie_id').equals(technologieId).toArray() : await db.competence.toArray()
      return toutes.sort((a, b) => a.libelle_fr.localeCompare(b.libelle_fr))
    },
    async ajouterCompetence(technologie_id, libelle_fr, libelle_en) {
      const c = { id: nouvelId(), technologie_id, libelle_fr: libelle_fr.trim(), libelle_en: libelle_en?.trim() || undefined }
      await db.competence.add(c)
      return c
    },
    async camps() {
      return db.camp.toArray()
    },
  }
  return repo
}
