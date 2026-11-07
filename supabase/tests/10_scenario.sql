-- Scénario complet joué à travers l'API, avec les droits réels :
-- comptes du personnel, camp, import d'élèves, fiche, test libre, mode piloté, validation.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create function test.garder(k text, v uuid) returns void language sql as $$ select set_config('test.v_' || k, v::text, false) $$;
create function test.id(k text) returns uuid language sql as $$ select current_setting('test.v_' || k)::uuid $$;
create function test.code(k text) returns text language sql as $$ select current_setting('test.c_' || k) $$;
grant execute on all functions in schema test to authenticated;

insert into auth.users values
  ('a0000000-0000-4000-8000-000000000001', 'ak@caysti.org'),
  ('a0000000-0000-4000-8000-000000000002', 'komla@caysti.org'),
  ('a0000000-0000-4000-8000-000000000003', 'akossiwa@caysti.org');

set role authenticated;

\echo '--- Comptes du personnel'
do $$
begin
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  perform test.ok(mon_profil() is null, 'un compte sans fiche n’a pas de profil');
  perform creer_mon_profil('Arielle', 'Kitio');
  perform test.ok(mon_profil() ->> 'email' = 'ak@caysti.org', 'la fiche reprend l’e-mail du compte');
  perform test.ok(jsonb_array_length(mon_profil() -> 'roles') = 0, 'un nouveau compte n’a aucun rôle');
  perform test.ok(test.erreur($q$select enregistrer_camp('{"nom":"X","pays_code":"TG","ville":"Lomé","date_debut":"2026-12-01","date_fin":"2026-12-10"}')$q$) like 'droits:%',
                  'sans rôle, impossible de créer un camp');
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform creer_mon_profil('Komla', 'Agbeko');
  perform test.comme('a0000000-0000-4000-8000-000000000003');
  perform creer_mon_profil('Akossiwa', 'Dzifa');
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  perform test.ok(test.erreur($q$select creer_mon_profil('X', 'Y')$q$) like 'droits:%', 'une tablette élève ne crée pas de compte du personnel');
  perform test.ok(mon_profil() is null, 'une tablette élève n’a pas de profil personnel');
end $$;

\echo '--- Aucun accès direct aux données'
do $$
begin
  perform test.ok(test.erreur('select * from eleve') like 'permission denied%', 'lecture directe de la table eleve refusée');
  perform test.ok(test.erreur('select * from choix') like 'permission denied%', 'lecture directe des bonnes réponses refusée');
  perform test.ok(test.erreur('select * from classement_session') like 'permission denied%', 'vue de classement fermée');
  perform test.ok(test.erreur($q$update tentative set score = 100$q$) like 'permission denied%', 'modification directe d’un score refusée');
  perform test.ok(test.erreur($q$select promouvoir_super_admin('ak@caysti.org')$q$) like 'permission denied%', 'promotion de super-admin impossible depuis l’application');
  perform test.ok(test.erreur($q$select ecrire_reponse(gen_random_uuid(), gen_random_uuid(), '{}', null, 0)$q$) like 'permission denied%', 'fonctions internes fermées');
end $$;

reset role;
select promouvoir_super_admin('ak@caysti.org');
set role authenticated;

\echo '--- Camp, ateliers, groupes, rôles'
do $$
declare v_techs jsonb; v_camp uuid; v_rob uuid; v_3d uuid;
begin
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  v_camp := enregistrer_camp('{"nom":"Camp CAYSTI Lomé","pays_code":"TG","pays_nom":"Togo","ville":"Lomé","date_debut":"2026-12-01","date_fin":"2026-12-10","statut":"en_cours"}');
  perform test.garder('camp', v_camp);
  perform test.ok(camps() -> 0 ->> 'ville' = 'Lomé', 'camp créé avec sa ville');
  perform attribuer_role('a0000000-0000-4000-8000-000000000002', 'formateur', v_camp);
  perform attribuer_role('a0000000-0000-4000-8000-000000000003', 'formateur', v_camp);
  perform attribuer_role('a0000000-0000-4000-8000-000000000003', 'formateur', v_camp); -- deux fois : pas de doublon
  perform test.ok(jsonb_array_length(liste_personnel() -> 2 -> 'roles') = 1, 'un rôle attribué deux fois n’est enregistré qu’une fois');

  v_techs := technologies();
  select (t ->> 'id')::uuid into v_rob from jsonb_array_elements(v_techs) t where t ->> 'nom_fr' = 'Robotique';
  select (t ->> 'id')::uuid into v_3d from jsonb_array_elements(v_techs) t where t ->> 'nom_fr' = 'Impression 3D';
  perform test.garder('tech_rob', v_rob);
  perform enregistrer_atelier(jsonb_build_object('id', 'b0000000-0000-4000-8000-000000000001', 'camp_id', v_camp, 'technologie_id', v_rob, 'titre_fr', 'Mon premier robot'));
  perform enregistrer_atelier(jsonb_build_object('id', 'b0000000-0000-4000-8000-000000000002', 'camp_id', v_camp, 'technologie_id', v_3d, 'titre_fr', 'Imprimer en 3D'));

  perform test.ok(test.erreur($q$select enregistrer_groupe('{"id":"c0000000-0000-4000-8000-000000000001","atelier_id":"b0000000-0000-4000-8000-000000000001","nom":"A","date":"2026-12-01","heure_debut":"12:00","heure_fin":"09:00"}', '[]')$q$)
                  = 'droits:L’heure de fin doit être après l’heure de début', 'horaires inversés refusés');
  perform test.ok(test.erreur($q$select enregistrer_groupe('{"id":"c0000000-0000-4000-8000-000000000001","atelier_id":"b0000000-0000-4000-8000-000000000001","nom":"A","date":"2026-12-01","heure_debut":"09:00","heure_fin":"12:00"}',
                  '[{"utilisateur_id":"a0000000-0000-4000-8000-000000000002","role":"principal"},{"utilisateur_id":"a0000000-0000-4000-8000-000000000003","role":"principal"}]')$q$)
                  = 'droits:Un groupe n’a qu’un formateur principal', 'deux formateurs principaux refusés');
  perform enregistrer_groupe('{"id":"c0000000-0000-4000-8000-000000000001","atelier_id":"b0000000-0000-4000-8000-000000000001","nom":"Groupe A","date":"2026-12-01","heure_debut":"09:00","heure_fin":"12:00","salle":"Salle 1"}',
    '[{"utilisateur_id":"a0000000-0000-4000-8000-000000000002","role":"principal"},{"utilisateur_id":"a0000000-0000-4000-8000-000000000003","role":"secondaire"}]');
  perform enregistrer_groupe('{"id":"c0000000-0000-4000-8000-000000000002","atelier_id":"b0000000-0000-4000-8000-000000000002","nom":"Groupe B","date":"2026-12-01","heure_debut":"14:00","heure_fin":"17:00"}',
    '[{"utilisateur_id":"a0000000-0000-4000-8000-000000000003","role":"principal"}]');
  perform test.ok(structure_camp(v_camp) -> 0 -> 'groupes' -> 0 -> 'groupe' ->> 'heure_debut' = '09:00', 'heures au format HH:MM');
  perform test.ok(structure_camp(v_camp) -> 0 -> 'groupes' -> 0 -> 'groupe' ->> 'statut' = 'a_venir', 'un nouveau groupe est à venir');

  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform test.ok(test.erreur(format('select structure_camp(%L)', v_camp)) like 'droits:%', 'un formateur ne gère pas le camp');
  perform test.ok(jsonb_array_length(groupes_personnel()) = 1 and groupes_personnel() -> 0 ->> 'role' = 'principal', 'Komla voit son seul groupe, comme principal');
  perform test.comme('a0000000-0000-4000-8000-000000000003');
  perform test.ok(jsonb_array_length(groupes_personnel()) = 2, 'Akossiwa voit ses deux groupes');
end $$;

\echo '--- Import des élèves'
do $$
declare r jsonb; v_ama text;
begin
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform test.ok(test.erreur(format($q$select importer_eleves(%L, '[]', '{}', 'x')$q$, test.id('camp'))) like 'droits:%', 'un formateur n’importe pas d’élèves');

  perform test.comme('a0000000-0000-4000-8000-000000000001');
  r := importer_eleves(test.id('camp'), $j$[
    {"nom":"MENSAH","prenom":"Ama","date_naissance":"2014-05-12","sexe":"F","classe":"CM2","ecole_nom":"EPP Agoè","tuteur":{"nom":"Mme Mensah","telephone":"+228 90 00 00 01"},"erreurs":[]},
    {"nom":"AGBODJAN","prenom":"Yaw","date_naissance":"2013-02-03","sexe":"M","classe":"6e","ecole_nom":"epp agoe","tuteur":{"whatsapp":"+228 91 00 00 02"},"erreurs":[]},
    {"nom":"SANS","prenom":"","date_naissance":null,"sexe":"F","classe":"6e","tuteur":{},"erreurs":["Prénom manquant"]}
  ]$j$, array['c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002']::uuid[], 'liste.xlsx');
  perform test.ok(jsonb_array_length(r -> 'crees') = 2 and jsonb_array_length(r -> 'rattaches') = 0, 'deux élèves créés, la ligne en erreur ignorée');
  perform test.ok((select count(*) from jsonb_array_elements(ecoles()) e where e ->> 'nom' ilike 'epp ago%') = 1, '« EPP Agoè » et « epp agoe » : une seule école');
  v_ama := r -> 'crees' -> 0 ->> 'code_acces';
  perform test.ok(v_ama ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$', 'code d’accès lisible généré');
  perform set_config('test.c_ama', v_ama, false);
  perform set_config('test.c_yaw', r -> 'crees' -> 1 ->> 'code_acces', false);

  -- le même élève revient sans être signalé par le client : le serveur le reconnaît
  r := importer_eleves(test.id('camp'), '[{"nom":"Mensah","prenom":"ama","date_naissance":"2014-05-12","sexe":"F","classe":"CM2","tuteur":{"telephone":"9"},"erreurs":[]}]',
                       array['c0000000-0000-4000-8000-000000000001']::uuid[], 'liste2.xlsx');
  perform test.ok(jsonb_array_length(r -> 'crees') = 0 and r -> 'rattaches' -> 0 ->> 'code_acces' = v_ama, 'un élève qui revient garde son code, sans doublon');
  perform test.ok(jsonb_array_length(eleves_camp(test.id('camp'))) = 2, 'deux élèves dans le camp');
  perform test.ok(eleves_camp(test.id('camp')) -> 0 -> 'tuteur' ->> 'whatsapp' = '+228 91 00 00 02', 'contact du parent enregistré');
end $$;

\echo '--- Fiche et validation'
do $$
begin
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform enregistrer_fiche(jsonb_build_object(
    'fiche', jsonb_build_object('id', 'f0000000-0000-4000-8000-000000000001', 'titre_fr', 'Quiz capteurs', 'type', 'quiz',
                                'technologie_id', test.id('tech_rob'), 'visibilite', 'officielle', 'mode_correction', 'ia_definitive'),
    'questions', $j$[
      {"id":"e0000000-0000-4000-8000-000000000001","type":"qcm_unique","enonce_fr":"Un capteur à ultrasons mesure…","duree_secondes":15,"points":1,"mode_bareme":"tout_ou_rien",
       "choix":[{"id":"e1000000-0000-4000-8000-000000000001","texte_fr":"une distance","est_correct":true},{"id":"e1000000-0000-4000-8000-000000000002","texte_fr":"une couleur","est_correct":false}]},
      {"id":"e0000000-0000-4000-8000-000000000002","type":"qcm_multiple","enonce_fr":"Coche les capteurs","duree_secondes":40,"points":3,"mode_bareme":"proportionnel",
       "choix":[{"id":"e2000000-0000-4000-8000-000000000001","texte_fr":"Ultrasons","est_correct":true},{"id":"e2000000-0000-4000-8000-000000000002","texte_fr":"Infrarouge","est_correct":true},
                {"id":"e2000000-0000-4000-8000-000000000003","texte_fr":"Lumière","est_correct":true},{"id":"e2000000-0000-4000-8000-000000000004","texte_fr":"Moteur","est_correct":false}]},
      {"id":"e0000000-0000-4000-8000-000000000003","type":"qro_ia","enonce_fr":"Qu’est-ce qu’un robot ?","duree_secondes":60,"points":2,"mode_bareme":"tout_ou_rien",
       "reponse_attendue_fr":"Une machine programmable qui perçoit et agit","choix":[]}
    ]$j$::jsonb));
  perform test.ok(charger_fiche('f0000000-0000-4000-8000-000000000001') -> 'fiche' ->> 'visibilite' = 'privee', 'un formateur ne rend pas sa fiche officielle lui-même');
  perform test.ok(jsonb_array_length(charger_fiche('f0000000-0000-4000-8000-000000000001') -> 'questions') = 3, 'trois questions enregistrées dans l’ordre');
  perform test.comme('a0000000-0000-4000-8000-000000000003');
  perform test.ok(test.erreur($q$select charger_fiche('f0000000-0000-4000-8000-000000000001')$q$) = 'droits:Fiche introuvable', 'une fiche privée n’est visible que de son auteur');
  perform test.ok(test.erreur($q$select valider_fiche('f0000000-0000-4000-8000-000000000001')$q$) like 'droits:%', 'un formateur ne valide pas');
  perform test.ok(test.erreur($q$select ajouter_activite('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001')$q$) like 'droits:Cette fiche doit%',
                  'la fiche non validée d’un autre ne se programme pas');

  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform soumettre_fiche('f0000000-0000-4000-8000-000000000001');
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  perform test.ok(test.erreur($q$select refuser_fiche('f0000000-0000-4000-8000-000000000001', '  ')$q$) like 'droits:Expliquez%', 'un refus doit être expliqué');
  perform valider_fiche('f0000000-0000-4000-8000-000000000001');
  perform test.ok(charger_fiche('f0000000-0000-4000-8000-000000000001') -> 'fiche' ->> 'visibilite' = 'officielle', 'fiche validée : officielle');

  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform test.ok(test.erreur($q$select ajouter_activite('c0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001')$q$) like 'droits:Ce groupe%',
                  'un formateur ne programme pas dans le groupe d’un autre');
  perform ajouter_activite('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
  perform test.garder('session', (detail_groupe('c0000000-0000-4000-8000-000000000001') -> 'activites' -> 0 -> 'session' ->> 'id')::uuid);
end $$;

\echo '--- Élève : connexion par code'
do $$
declare e jsonb; i int;
begin
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  perform test.ok(connexion_eleve('zzzzzz') is null, 'code inconnu : aucun élève');
  e := connexion_eleve(' ' || lower(test.code('ama')) || ' ');
  perform test.ok(e ->> 'prenom' = 'Ama', 'code reconnu malgré minuscules et espaces');
  perform test.ok(jsonb_array_length(ateliers_eleve()) = 2 and ateliers_eleve() -> 0 -> 'groupe' ->> 'heure_debut' = '09:00', 'deux ateliers, dans l’ordre de la journée');
  perform test.ok(ateliers_eleve() -> 0 -> 'activites' -> 0 ->> 'nb_questions' = '3', 'nombre de questions fourni');

  -- on essaie de deviner des codes depuis une autre tablette
  perform test.comme('d0000000-0000-4000-8000-000000000099', true);
  for i in 1..10 loop perform connexion_eleve('AAAAA' || i); end loop;
  perform test.ok(test.erreur(format('select connexion_eleve(%L)', test.code('ama'))) = 'trop_essais', 'après 10 codes faux, la tablette est freinée');
end $$;

\echo '--- Élève : test à son rythme'
do $$
declare q jsonb; t jsonb; r jsonb;
begin
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  q := charger_session(test.id('session'));
  perform test.ok(not exists (select 1 from jsonb_array_elements(q -> 'questions') x, jsonb_array_elements(x -> 'choix') c where (c ->> 'est_correct')::boolean),
                  'l’élève ne reçoit aucune bonne réponse');
  perform test.ok(q -> 'questions' -> 2 -> 'reponse_attendue_fr' is null, 'ni la réponse attendue de la question écrite');

  perform test.ok(test.erreur(format($q$select demarrer_tentative(%L, 'fr')$q$, test.id('session'))) = 'atelier_inactif', 'atelier pas démarré : refus');
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform changer_statut_groupe('c0000000-0000-4000-8000-000000000001', 'en_cours');
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  perform test.ok(test.erreur(format($q$select demarrer_tentative(%L, 'fr')$q$, test.id('session'))) = 'session_fermee', 'activité pas ouverte : refus');
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform changer_statut_session(test.id('session'), 'ouverte');

  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  t := demarrer_tentative(test.id('session'), 'fr');
  perform test.garder('t_ama', (t -> 'tentative' ->> 'id')::uuid);
  r := enregistrer_reponse(test.id('t_ama'), 'e0000000-0000-4000-8000-000000000001', array['e1000000-0000-4000-8000-000000000001']::uuid[], null, 999999);
  perform test.ok((r ->> 'score_final')::numeric = 1 and (r ->> 'temps_ms')::int = 15000, 'bonne réponse : 1 point ; temps plafonné à la durée de la question');
  r := enregistrer_reponse(test.id('t_ama'), 'e0000000-0000-4000-8000-000000000002',
                           array['e2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000004']::uuid[], null, 20000);
  perform test.ok((r ->> 'score_final')::numeric = 2, 'proportionnel : 2 bonnes cases sur 3, sans pénalité pour la fausse');
  r := enregistrer_reponse(test.id('t_ama'), 'e0000000-0000-4000-8000-000000000003', '{}', 'Une machine', 30000);
  perform test.ok(r ->> 'statut_correction' = 'en_attente', 'réponse écrite en attente de correction');
  perform test.ok(test.erreur(format($q$select enregistrer_reponse(%L, gen_random_uuid(), '{}', null, 0)$q$, test.id('t_ama'))) = 'hors_question',
                  'une question qui n’est pas dans la fiche est refusée');

  -- reprise après coupure : la tentative en cours revient avec ses réponses
  perform test.ok(jsonb_array_length(demarrer_tentative(test.id('session'), 'fr') -> 'reponses') = 3, 'reprise : les réponses déjà données sont rendues');
  t := soumettre_tentative(test.id('t_ama'));
  perform test.ok((t -> 'tentative' ->> 'score')::numeric = 3 and (t -> 'tentative' ->> 'score_max')::numeric = 6 and (t ->> 'en_attente')::int = 1,
                  'score 3 sur 6, une réponse écrite en attente');
  perform test.ok((t -> 'tentative' ->> 'temps_total_ms')::int = 65000, 'temps total');
  t := soumettre_tentative(test.id('t_ama'));
  perform test.ok((t -> 'tentative' ->> 'score')::numeric = 3, 'envoi répété (réseau rétabli) : rien ne change');
  perform test.ok(test.erreur(format($q$select demarrer_tentative(%L, 'fr')$q$, test.id('session'))) = 'deja_soumise', 'une seule tentative par activité');
  perform test.ok(classement(test.id('session')) -> 0 ->> 'nom_affiche' = 'Ama M.', 'classement en « Prénom + initiale »');

  -- Yaw, sur une autre tablette, ne peut pas écrire dans la tentative d'Ama
  perform test.comme('d0000000-0000-4000-8000-000000000002', true);
  perform connexion_eleve(test.code('yaw'));
  perform test.ok(test.erreur(format($q$select enregistrer_reponse(%L, 'e0000000-0000-4000-8000-000000000001', '{}', null, 1)$q$, test.id('t_ama'))) = 'non_inscrit',
                  'un élève ne peut pas répondre à la place d’un autre');
  perform test.ok(tentative_de(test.id('session')) is null, 'Yaw ne voit pas la tentative d’Ama');
end $$;

\echo '--- Formateur : résultats'
do $$
declare l jsonb;
begin
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  l := resultats_session(test.id('session'));
  perform test.ok(jsonb_array_length(l) = 2 and l -> 0 -> 'eleve' ->> 'prenom' = 'Ama' and l -> 1 -> 'tentative' is null, 'Ama a terminé, Yaw pas commencé');
  perform test.ok((l -> 0 ->> 'en_attente')::int = 1, 'réponse écrite à corriger signalée');
  perform test.ok(test.erreur(format('select changer_mode_session(%L, %L)', test.id('session'), 'pilote')) like 'droits:Des élèves%', 'le mode ne change plus après le début');
  perform test.ok(test.erreur(format('select retirer_activite(%L)', test.id('session'))) like 'droits:Des élèves%', 'activité commencée : retrait impossible');
  perform test.ok(test.erreur($q$select enregistrer_fiche('{"fiche":{"id":"f0000000-0000-4000-8000-000000000001","titre_fr":"Autre","type":"quiz"},"questions":[]}')$q$) like 'droits:%',
                  'une fiche officielle ne se modifie plus');
end $$;

\echo '--- Mode piloté'
do $$
declare v_s uuid; t_yaw uuid; t_ama uuid; e jsonb; v_temps_q1 int;
begin
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform ajouter_activite('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
  v_s := (detail_groupe('c0000000-0000-4000-8000-000000000001') -> 'activites' -> 1 -> 'session' ->> 'id')::uuid;
  perform test.garder('pilote', v_s);
  perform changer_mode_session(v_s, 'pilote');
  perform changer_statut_session(v_s, 'ouverte');

  perform test.comme('d0000000-0000-4000-8000-000000000002', true);
  perform test.ok(test.erreur(format($q$select demarrer_tentative(%L, 'fr')$q$, v_s)) = 'session_pilotee', 'une partie pilotée ne se joue pas à son rythme');
  t_yaw := (rejoindre_pilote(v_s, 'fr') ->> 'id')::uuid;
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  t_ama := (rejoindre_pilote(v_s, 'fr') ->> 'id')::uuid;
  e := etat_pilote(v_s);
  perform test.ok((e ->> 'index')::int = -1 and jsonb_array_length(e -> 'participants') = 2, 'salle d’attente : deux élèves');
  perform test.ok(length(e -> 'participants' -> 0 -> 'eleve' ->> 'nom') = 1, 'les élèves ne voient que l’initiale du nom des autres');
  perform test.ok(test.erreur(format($q$select repondre_pilote(%L, 'e0000000-0000-4000-8000-000000000001', '{}', null)$q$, t_ama)) = 'hors_question', 'pas de réponse avant le lancement');

  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform piloter(v_s, 'suivante');

  perform test.comme('d0000000-0000-4000-8000-000000000002', true);
  e := etat_pilote(v_s);
  perform test.ok((e ->> 'index')::int = 0, 'la question 1 est affichée chez l’élève');
  perform test.ok(not exists (select 1 from jsonb_array_elements(e -> 'questions' -> 0 -> 'choix') c where (c ->> 'est_correct')::boolean), 'bonne réponse cachée pendant la question');
  perform repondre_pilote(t_yaw, 'e0000000-0000-4000-8000-000000000001', array['e1000000-0000-4000-8000-000000000001']::uuid[], null);
  perform test.ok(test.erreur(format($q$select repondre_pilote(%L, 'e0000000-0000-4000-8000-000000000001', '{}', null)$q$, t_yaw)) = 'deja_repondu', 'une seule réponse par question');
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  perform repondre_pilote(t_ama, 'e0000000-0000-4000-8000-000000000001', array['e1000000-0000-4000-8000-000000000002']::uuid[], null);
  perform test.ok(jsonb_array_length(etat_pilote(v_s) -> 'reponsesQuestion') = 1, 'l’élève ne voit que sa propre réponse');
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform test.ok(jsonb_array_length(etat_pilote(v_s) -> 'reponsesQuestion') = 2, 'le formateur voit toutes les réponses');
  perform piloter(v_s, 'reveler');

  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  perform test.ok(exists (select 1 from jsonb_array_elements(etat_pilote(v_s) -> 'questions' -> 0 -> 'choix') c where (c ->> 'est_correct')::boolean), 'bonne réponse visible après révélation');
  perform test.ok(not exists (select 1 from jsonb_array_elements(etat_pilote(v_s) -> 'questions' -> 1 -> 'choix') c where (c ->> 'est_correct')::boolean), 'questions suivantes toujours cachées');
  perform test.ok(classement_en_direct(v_s) -> 0 ->> 'nom_affiche' = 'Yaw A.', 'classement intermédiaire : Yaw devant');
  perform test.ok(test.erreur(format($q$select repondre_pilote(%L, 'e0000000-0000-4000-8000-000000000001', '{}', null)$q$, t_ama)) = 'hors_question', 'plus de réponse après la révélation');

  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform piloter(v_s, 'suivante');
end $$;

-- question 2 lancée il y a 50 s (elle dure 40 s) : trop tard pour répondre
reset role;
update session_evaluation set question_lancee_le = now() - interval '50 seconds' where id = current_setting('test.v_pilote')::uuid;
set role authenticated;

do $$
declare v_s uuid := test.id('pilote'); e jsonb;
begin
  perform test.comme('d0000000-0000-4000-8000-000000000002', true);
  perform test.ok(test.erreur(format($q$select repondre_pilote((select (tentative_de(%L) -> 'tentative' ->> 'id')::uuid), 'e0000000-0000-4000-8000-000000000002', '{}', null)$q$, v_s)) = 'hors_question',
                  'réponse après la fin du chrono refusée (temps mesuré par le serveur)');
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform piloter(v_s, 'terminer');
  e := etat_pilote(v_s);
  perform test.ok(e -> 'detail' -> 'session' ->> 'etape' = 'terminee' and e -> 'detail' -> 'session' ->> 'statut' = 'fermee', 'partie terminée et fermée');
  perform test.ok(classement(v_s) -> 0 ->> 'nom_affiche' = 'Yaw A.' and (classement(v_s) -> 0 ->> 'score')::numeric = 1, 'classement final');
  perform test.ok((classement(v_s) -> 1 ->> 'temps_total_ms')::int >= 40000, 'question 2 manquée comptée pour toute sa durée');
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  perform test.ok(test.erreur(format($q$select rejoindre_pilote(%L, 'fr')$q$, v_s)) = 'session_fermee', 'on ne rejoint plus une partie terminée');
end $$;

reset role;
do $$ begin
  perform test.ok((select count(*) from realtime.journal where topic = 'session:' || current_setting('test.v_pilote')) >= 6, 'les écrans sont prévenus à chaque étape (temps réel)');
end $$;
set role authenticated;

\echo '--- Duplication et cycle de validation'
do $$
declare v_copie uuid; f jsonb;
begin
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  v_copie := dupliquer_fiche('f0000000-0000-4000-8000-000000000001');
  f := charger_fiche(v_copie);
  perform test.ok(f -> 'fiche' ->> 'titre_fr' = 'Quiz capteurs (copie)' and f -> 'fiche' ->> 'statut_validation' = 'brouillon' and f -> 'fiche' ->> 'visibilite' = 'privee',
                  'copie privée en brouillon');
  perform test.ok(f -> 'questions' -> 0 ->> 'id' <> 'e0000000-0000-4000-8000-000000000001', 'questions copiées, pas partagées');
  perform test.ok((select count(*) from jsonb_array_elements(f -> 'questions' -> 1 -> 'choix') c where (c ->> 'est_correct')::boolean) = 3, 'bonnes réponses conservées');
  perform soumettre_fiche(v_copie);
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  perform refuser_fiche(v_copie, 'Ajoute une image');
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform test.ok(charger_fiche(v_copie) -> 'fiche' ->> 'commentaire_validation' = 'Ajoute une image', 'l’auteur lit la remarque');
  perform enregistrer_fiche(jsonb_build_object('fiche', (charger_fiche(v_copie) -> 'fiche') || '{"titre_fr":"Quiz capteurs v2"}', 'questions', charger_fiche(v_copie) -> 'questions'));
  perform test.ok(charger_fiche(v_copie) -> 'fiche' ->> 'statut_validation' = 'brouillon', 'corrigée : repasse en brouillon');
  perform test.ok(jsonb_array_length(charger_fiche(v_copie) -> 'questions') = 3, 'questions conservées à l’enregistrement');
  -- retrait d'une question à l'enregistrement
  perform enregistrer_fiche(jsonb_build_object('fiche', charger_fiche(v_copie) -> 'fiche', 'questions', jsonb_build_array(charger_fiche(v_copie) -> 'questions' -> 1, charger_fiche(v_copie) -> 'questions' -> 0)));
  f := charger_fiche(v_copie);
  perform test.ok(jsonb_array_length(f -> 'questions') = 2 and f -> 'questions' -> 0 ->> 'enonce_fr' = 'Coche les capteurs', 'question retirée et ordre changé');
  perform supprimer_fiche(v_copie);
  perform test.ok(test.erreur(format('select charger_fiche(%L)', v_copie)) = 'droits:Fiche introuvable', 'brouillon supprimé');
  perform test.ok(test.erreur($q$select supprimer_fiche('f0000000-0000-4000-8000-000000000001')$q$) like 'droits:%', 'une fiche programmée ne se supprime pas');
end $$;

\echo '--- Gestion des groupes'
do $$
begin
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  perform test.ok(test.erreur($q$select supprimer_groupe('c0000000-0000-4000-8000-000000000001')$q$) like 'droits:Des élèves%', 'groupe déjà utilisé : suppression impossible');
  perform supprimer_groupe('c0000000-0000-4000-8000-000000000002');
  perform test.ok(jsonb_array_length(structure_camp(test.id('camp')) -> 1 -> 'groupes') = 0, 'groupe vide supprimé');
end $$;

\echo 'Tous les tests SQL sont passés.'
