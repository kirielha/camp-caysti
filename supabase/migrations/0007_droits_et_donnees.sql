-- =====================================================================
-- 0007 — Fonctions appelables depuis l'application, et données de base
-- =====================================================================

-- Liste blanche : seules ces fonctions sont appelables par une session (élève ou personnel).
-- Les fonctions internes (écriture sans contrôle, promotion de super-admin...) ne le sont pas.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  -- élèves
  connexion_eleve(text), changer_langue(langue_interface), ateliers_eleve(), charger_session(uuid),
  demarrer_tentative(uuid, langue_interface), enregistrer_reponse(uuid, uuid, uuid[], text, int),
  soumettre_tentative(uuid), tentative_de(uuid), progression(uuid), classement(uuid, int),
  rejoindre_pilote(uuid, langue_interface), repondre_pilote(uuid, uuid, uuid[], text), etat_pilote(uuid),
  classement_en_direct(uuid, int),
  -- comptes du personnel
  mon_profil(), creer_mon_profil(text, text, text), liste_personnel(), attribuer_role(uuid, role_utilisateur, uuid), retirer_role(uuid),
  -- pilotage
  groupes_personnel(), detail_groupe(uuid), resultats_session(uuid), changer_statut_groupe(uuid, statut_groupe),
  changer_statut_session(uuid, statut_session), changer_affichage_classement(uuid, boolean), changer_mode_session(uuid, mode_session),
  piloter(uuid, text), ajouter_activite(uuid, uuid), retirer_activite(uuid),
  -- fiches
  fiches_visibles(), charger_fiche(uuid), enregistrer_fiche(jsonb), dupliquer_fiche(uuid), soumettre_fiche(uuid),
  valider_fiche(uuid), refuser_fiche(uuid, text), supprimer_fiche(uuid),
  -- camp
  camps(), enregistrer_camp(jsonb), structure_camp(uuid), enregistrer_atelier(jsonb), enregistrer_groupe(jsonb, jsonb),
  supprimer_groupe(uuid), formateurs(), eleves_camp(uuid), enregistrer_eleve(uuid, jsonb, jsonb, uuid[]),
  importer_eleves(uuid, jsonb, uuid[], text),
  -- référentiels
  ecoles(), langues(), identites_eleves(), technologies(), competences(uuid), ajouter_competence(uuid, text, text)
to authenticated;

-- Données de base
insert into technologie (nom_fr, nom_en, couleur)
select v.nom_fr, v.nom_en, v.couleur from (values
  ('Impression 3D', '3D printing', '#17a07a')
) v(nom_fr, nom_en, couleur)
where not exists (select 1 from technologie t where t.nom_fr = v.nom_fr);

update technologie set couleur = case nom_fr
  when 'Robotique' then '#e5484d' when 'Intelligence artificielle' then '#7b5cd6'
  when 'Internet des objets' then '#1d8fc9' when 'Programmation' then '#e8a21c' else couleur end
where couleur is null;

insert into langue (libelle_fr, libelle_en, est_autre, ordre)
select * from (values
  ('Français', 'French', false, 0), ('Anglais', 'English', false, 1), ('Éwé', 'Ewe', false, 2), ('Mina', 'Mina', false, 3),
  ('Kabyè', 'Kabiye', false, 4), ('Fon', 'Fon', false, 5), ('Yoruba', 'Yoruba', false, 6), ('Haoussa', 'Hausa', false, 7),
  ('Lingala', 'Lingala', false, 8), ('Wolof', 'Wolof', false, 9), ('Autre', 'Other', true, 99)
) v(libelle_fr, libelle_en, est_autre, ordre)
where not exists (select 1 from langue l where l.libelle_fr = v.libelle_fr);
