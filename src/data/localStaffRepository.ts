import { estAdmin, estAdminCamp, ficheVisible, nomComplet, peutModifierFiche, peutProgrammer, peutValider } from '../lib/droits'
import { nouvelId } from '../lib/ids'
import { genererCode, normaliser } from '../lib/importEleves'
import { totaliser } from '../lib/scoring'
import type { AtelierDuCamp, Choix, Eleve, EleveDuCamp, Fiche, GroupePourFormateur, Personnel, Question, Utilisateur } from '../types'
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

  /** Remplace les inscriptions d'un élève aux groupes de ce camp (les autres camps ne sont pas touchés). */
  async function remplacerInscriptions(eleveId: string, campId: string, groupeIds: string[]) {
    const ateliers = await db.atelier.where('camp_id').equals(campId).primaryKeys()
    const groupesDuCamp = new Set(await db.groupe.where('atelier_id').anyOf(ateliers).primaryKeys())
    const actuelles = (await db.inscription.where('eleve_id').equals(eleveId).toArray()).filter((i) => groupesDuCamp.has(i.groupe_id))
    const voulues = new Set(groupeIds.filter((g) => groupesDuCamp.has(g)))
    for (const i of actuelles) if (!voulues.has(i.groupe_id)) await db.inscription.delete(i.id)
    for (const g of voulues) {
      if (!actuelles.some((i) => i.groupe_id === g)) await db.inscription.add({ id: nouvelId(), eleve_id: eleveId, groupe_id: g, inscrit_le: maintenant() })
    }
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

    // ---------------------------------------------------------------- Gestion du camp
    async structureCamp(campId) {
      const ateliers = await db.atelier.where('camp_id').equals(campId).toArray()
      const resultat: AtelierDuCamp[] = []
      for (const atelier of ateliers) {
        const technologie = await db.technologie.get(atelier.technologie_id)
        if (!technologie) continue
        const groupes = (await db.groupe.where('atelier_id').equals(atelier.id).toArray())
          .sort((a, b) => `${a.date} ${a.heure_debut}`.localeCompare(`${b.date} ${b.heure_debut}`))
        resultat.push({
          atelier, technologie,
          groupes: await Promise.all(groupes.map(async (groupe) => {
            const aff = await db.groupe_formateur.where('groupe_id').equals(groupe.id).toArray()
            const formateurs = (await Promise.all(aff.map(async (a) => {
              const utilisateur = await db.utilisateur.get(a.utilisateur_id)
              return utilisateur && { utilisateur, role: a.role }
            }))).filter((x): x is { utilisateur: Utilisateur; role: 'principal' | 'secondaire' } => !!x)
            return { groupe, formateurs, nb_eleves: await db.inscription.where('groupe_id').equals(groupe.id).count() }
          })),
        })
      }
      return resultat.sort((a, b) => (a.groupes[0] ? `${a.groupes[0].groupe.date} ${a.groupes[0].groupe.heure_debut}` : 'z')
        .localeCompare(b.groupes[0] ? `${b.groupes[0].groupe.date} ${b.groupes[0].groupe.heure_debut}` : 'z'))
    },

    async enregistrerAtelier(atelier, p) {
      if (!estAdminCamp(p, atelier.camp_id)) throw new ErreurDroits('Seul un admin du camp gère les ateliers')
      if (!atelier.titre_fr.trim()) throw new ErreurDroits('Donnez un titre à l’atelier')
      await db.atelier.put({ ...atelier, titre_fr: atelier.titre_fr.trim() })
    },

    async enregistrerGroupe(groupe, formateurs, p) {
      const atelier = await db.atelier.get(groupe.atelier_id)
      if (!atelier || !estAdminCamp(p, atelier.camp_id)) throw new ErreurDroits('Seul un admin du camp gère les groupes')
      if (!groupe.nom.trim()) throw new ErreurDroits('Donnez un nom au groupe')
      if (groupe.heure_fin <= groupe.heure_debut) throw new ErreurDroits('L’heure de fin doit être après l’heure de début')
      if (formateurs.filter((f) => f.role === 'principal').length > 1) throw new ErreurDroits('Un groupe n’a qu’un formateur principal')
      const avant = await db.groupe.get(groupe.id)
      await db.transaction('rw', [db.groupe, db.groupe_formateur], async () => {
        await db.groupe.put({ ...groupe, nom: groupe.nom.trim(), statut: groupe.statut ?? avant?.statut ?? 'a_venir' })
        await db.groupe_formateur.where('groupe_id').equals(groupe.id).delete()
        const uniques = new Map(formateurs.map((f) => [f.utilisateur_id, f]))
        await db.groupe_formateur.bulkAdd([...uniques.values()].map((f) => ({ id: nouvelId(), groupe_id: groupe.id, ...f })))
      })
    },

    async supprimerGroupe(groupeId, p) {
      const { camp } = await contexteGroupe(groupeId)
      if (!estAdminCamp(p, camp.id)) throw new ErreurDroits('Seul un admin du camp supprime un groupe')
      const sessions = await db.session_evaluation.where('groupe_id').equals(groupeId).toArray()
      if (await db.tentative.where('session_id').anyOf(sessions.map((s) => s.id)).count()) {
        throw new ErreurDroits('Des élèves ont déjà passé des activités dans ce groupe : il ne peut plus être supprimé')
      }
      await db.transaction('rw', [db.groupe, db.groupe_formateur, db.inscription, db.session_evaluation], async () => {
        await db.groupe_formateur.where('groupe_id').equals(groupeId).delete()
        await db.inscription.where('groupe_id').equals(groupeId).delete()
        await db.session_evaluation.where('groupe_id').equals(groupeId).delete()
        await db.groupe.delete(groupeId)
      })
    },

    async formateurs() {
      const roles = await db.attribution_role.toArray()
      const ids = new Set(roles.filter((r) => r.role === 'formateur' || r.role === 'admin_camp' || r.role === 'super_admin').map((r) => r.utilisateur_id))
      return (await db.utilisateur.toArray()).filter((u) => u.actif && ids.has(u.id)).sort((a, b) => a.nom.localeCompare(b.nom))
    },

    async elevesDuCamp(campId) {
      const ateliers = await db.atelier.where('camp_id').equals(campId).toArray()
      const groupes = await db.groupe.where('atelier_id').anyOf(ateliers.map((a) => a.id)).toArray()
      const inscriptions = await db.inscription.where('groupe_id').anyOf(groupes.map((g) => g.id)).toArray()
      const parEleve = new Map<string, string[]>()
      for (const i of inscriptions) parEleve.set(i.eleve_id, [...(parEleve.get(i.eleve_id) ?? []), i.groupe_id])
      const resultat: EleveDuCamp[] = []
      for (const [eleveId, gids] of parEleve) {
        const eleve = await db.eleve.get(eleveId)
        if (!eleve) continue
        const lien = await db.eleve_tuteur.where('eleve_id').equals(eleveId).filter((l) => l.tuteur_principal).first()
          ?? await db.eleve_tuteur.where('eleve_id').equals(eleveId).first()
        resultat.push({
          eleve,
          ecole: eleve.ecole_id ? await db.ecole.get(eleve.ecole_id) : undefined,
          tuteur: lien ? await db.tuteur.get(lien.tuteur_id) : undefined,
          groupes: gids.map((gid) => {
            const groupe = groupes.find((g) => g.id === gid)!
            return { groupe, atelier: ateliers.find((a) => a.id === groupe.atelier_id)! }
          }).sort((a, b) => `${a.groupe.date} ${a.groupe.heure_debut}`.localeCompare(`${b.groupe.date} ${b.groupe.heure_debut}`)),
        })
      }
      return resultat.sort((a, b) => a.eleve.nom.localeCompare(b.eleve.nom) || a.eleve.prenom.localeCompare(b.eleve.prenom))
    },

    async enregistrerEleve(campId, { eleve, tuteur, groupeIds }, p) {
      if (!estAdminCamp(p, campId)) throw new ErreurDroits('Seul un admin du camp inscrit des élèves')
      if (!eleve.nom.trim() || !eleve.prenom.trim()) throw new ErreurDroits('Nom et prénom sont obligatoires')
      if (!eleve.date_naissance) throw new ErreurDroits('La date de naissance est obligatoire')
      if (!tuteur.telephone && !tuteur.whatsapp && !tuteur.email) throw new ErreurDroits('Indiquez au moins un contact du parent')
      const existant = await db.eleve.get(eleve.id)
      const codes = new Set((await db.eleve.toArray()).map((e) => e.code_acces))
      const complet: Eleve = {
        ...eleve, nom: eleve.nom.trim().toUpperCase(), prenom: eleve.prenom.trim(),
        code_acces: existant?.code_acces ?? genererCode((c) => codes.has(c)),
      }
      await db.transaction('rw', [db.eleve, db.tuteur, db.eleve_tuteur, db.inscription, db.groupe, db.atelier], async () => {
        await db.eleve.put(complet)
        const tuteurId = tuteur.id ?? nouvelId()
        await db.tuteur.put({ ...tuteur, id: tuteurId, nom: tuteur.nom?.trim() || '—' })
        if (!(await db.eleve_tuteur.get([complet.id, tuteurId]))) {
          await db.eleve_tuteur.where('eleve_id').equals(complet.id).modify({ tuteur_principal: false })
          await db.eleve_tuteur.add({ eleve_id: complet.id, tuteur_id: tuteurId, tuteur_principal: true })
        }
        await remplacerInscriptions(complet.id, campId, groupeIds)
      })
      return complet
    },

    async importerEleves(campId, lignes, groupeIds, fichier, p) {
      if (!estAdminCamp(p, campId)) throw new ErreurDroits('Seul un admin du camp importe des élèves')
      const valides = lignes.filter((l) => l.erreurs.length === 0)
      const crees: Eleve[] = []
      const rattaches: Eleve[] = []
      await db.transaction('rw', [db.eleve, db.tuteur, db.eleve_tuteur, db.inscription, db.ecole, db.lot_import, db.groupe, db.atelier], async () => {
        const codes = new Set((await db.eleve.toArray()).map((e) => e.code_acces))
        const ecoles = new Map((await db.ecole.toArray()).map((e) => [normaliser(e.nom), e.id]))
        for (const l of valides) {
          let eleve = l.eleve_existant_id ? await db.eleve.get(l.eleve_existant_id) : undefined
          if (eleve) {
            rattaches.push(eleve)
          } else {
            // école inconnue : créée une seule fois même si plusieurs lignes la citent
            let ecole_id = l.ecole_id
            if (!ecole_id && l.ecole_nom) {
              ecole_id = ecoles.get(normaliser(l.ecole_nom))
              if (!ecole_id) {
                ecole_id = nouvelId()
                await db.ecole.add({ id: ecole_id, nom: l.ecole_nom })
                ecoles.set(normaliser(l.ecole_nom), ecole_id)
              }
            }
            const code = genererCode((c) => codes.has(c))
            codes.add(code)
            eleve = {
              id: nouvelId(), code_acces: code, nom: l.nom, prenom: l.prenom, date_naissance: l.date_naissance!,
              sexe: l.sexe!, classe: l.classe!, ecole_id, langue_id: l.langue_id, langue_autre: l.langue_autre, langue_interface: 'fr',
            }
            await db.eleve.add(eleve)
            const tuteurId = nouvelId()
            await db.tuteur.add({ id: tuteurId, ...l.tuteur, nom: l.tuteur.nom || '—' })
            await db.eleve_tuteur.add({ eleve_id: eleve.id, tuteur_id: tuteurId, tuteur_principal: true })
            crees.push(eleve)
          }
          for (const gid of groupeIds) {
            if (!(await db.inscription.where('[eleve_id+groupe_id]').equals([eleve.id, gid]).count())) {
              await db.inscription.add({ id: nouvelId(), eleve_id: eleve.id, groupe_id: gid, inscrit_le: maintenant() })
            }
          }
        }
        await db.lot_import.add({
          id: nouvelId(), utilisateur_id: p.id, camp_id: campId, fichier, importe_le: maintenant(),
          lignes_ok: valides.length, lignes_erreur: lignes.length - valides.length,
        })
      })
      return { crees, rattaches }
    },

    async ecoles() {
      return (await db.ecole.toArray()).sort((a, b) => a.nom.localeCompare(b.nom))
    },
    async langues() {
      return (await db.langue.toArray()).sort((a, b) => a.ordre - b.ordre)
    },
    async identitesEleves() {
      return (await db.eleve.toArray()).map(({ id, nom, prenom, date_naissance }) => ({ id, nom, prenom, date_naissance }))
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
