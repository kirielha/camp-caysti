-- Parties d'atelier : déroulé recopié dans les groupes, ressources, export
\echo '--- Parties d’atelier'
do $$
declare
  v_pre uuid := 'f0000000-0000-4000-8000-000000000011';
  v_post uuid := 'f0000000-0000-4000-8000-000000000012';
  v_quiz uuid := 'f0000000-0000-4000-8000-000000000001';
  v_partie uuid;
  d jsonb;
  q text := $j$[{"id":"e%s000000-0000-4000-8000-000000000001","type":"qcm_unique","enonce_fr":"Une LED…","duree_secondes":20,"points":1,"mode_bareme":"tout_ou_rien",
                 "choix":[{"id":"e%s100000-0000-4000-8000-000000000001","texte_fr":"éclaire","est_correct":true},{"id":"e%s100000-0000-4000-8000-000000000002","texte_fr":"mesure","est_correct":false}]}]$j$;
begin
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform enregistrer_fiche(jsonb_build_object('fiche', jsonb_build_object('id', v_pre, 'titre_fr', 'Prétest IoT', 'type', 'pretest',
    'technologie_id', test.id('tech_rob'), 'visibilite', 'partagee', 'mode_correction', 'ia_definitive'), 'questions', format(q, '8', '8', '8')::jsonb));
  perform enregistrer_fiche(jsonb_build_object('fiche', jsonb_build_object('id', v_post, 'titre_fr', 'Post-test IoT', 'type', 'posttest',
    'technologie_id', test.id('tech_rob'), 'visibilite', 'partagee', 'mode_correction', 'ia_definitive'), 'questions', format(q, '9', '9', '9')::jsonb));
  perform soumettre_fiche(v_pre);

  perform test.ok(test.erreur(format($q$select enregistrer_partie('{"partie":{"atelier_id":"b0000000-0000-4000-8000-000000000001","titre_fr":"IoT"}}')$q$)) like 'droits:Seul un admin%',
                  'un formateur ne crée pas de partie');
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  perform valider_fiche(v_pre);
  perform test.ok(test.erreur(format($q$select enregistrer_partie(jsonb_build_object('partie', jsonb_build_object('atelier_id', 'b0000000-0000-4000-8000-000000000001', 'titre_fr', 'IoT', 'fiche_posttest_id', %L)))$q$, v_post))
                  = 'droits:Choisissez des fiches validées par un admin', 'fiche non validée refusée dans une partie');
  perform test.ok(test.erreur(format($q$select enregistrer_partie(jsonb_build_object('partie', jsonb_build_object('atelier_id', 'b0000000-0000-4000-8000-000000000001', 'titre_fr', 'IoT', 'fiche_quiz_id', %L)))$q$, v_pre))
                  like 'droits:Chaque case%', 'une fiche du mauvais type est refusée');
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform soumettre_fiche(v_post);
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  perform valider_fiche(v_post);

  v_partie := enregistrer_partie(jsonb_build_object(
    'partie', jsonb_build_object('atelier_id', 'b0000000-0000-4000-8000-000000000001', 'ordre', 1, 'titre_fr', 'IoT',
                                 'fiche_pretest_id', v_pre, 'fiche_quiz_id', v_quiz, 'fiche_posttest_id', v_post),
    'ressources', jsonb_build_array(jsonb_build_object('titre', 'Allumer la LED', 'langage', 'arduino', 'contenu', E'void setup() {\n  pinMode(13, OUTPUT);\n}'),
                                    jsonb_build_object('titre', 'vide', 'contenu', '   '))));
  perform test.garder('partie', v_partie);
  d := detail_groupe('c0000000-0000-4000-8000-000000000001');
  perform test.ok((select count(*) from jsonb_array_elements(d -> 'activites') a where a -> 'session' ->> 'partie_id' = v_partie::text) = 3,
                  'les trois fiches de la partie deviennent des activités du groupe');
  perform test.ok(d -> 'activites' -> 0 -> 'fiche' ->> 'type' = 'pretest' and d -> 'activites' -> 0 -> 'session' ->> 'statut' = 'brouillon',
                  'déroulé dans l’ordre, activités fermées');
  perform test.ok(jsonb_array_length(d -> 'parties' -> 0 -> 'ressources') = 1, 'ressource vide ignorée');
  perform test.ok(d -> 'parties' -> 0 -> 'ressources' -> 0 ->> 'contenu' like E'void setup() {\n%', 'code source conservé tel quel');

  perform enregistrer_partie(jsonb_build_object('partie', (d -> 'parties' -> 0 -> 'partie') || '{"titre_fr":"IoT (capteurs)"}', 'ressources', d -> 'parties' -> 0 -> 'ressources'));
  d := detail_groupe('c0000000-0000-4000-8000-000000000001');
  perform test.ok((select count(*) from jsonb_array_elements(d -> 'activites') a where a -> 'session' ->> 'partie_id' = v_partie::text) = 3, 'réenregistrer ne duplique pas les activités');
  perform test.ok(d -> 'parties' -> 0 -> 'partie' ->> 'titre_fr' = 'IoT (capteurs)', 'partie renommée');

  perform enregistrer_groupe('{"id":"c0000000-0000-4000-8000-000000000003","atelier_id":"b0000000-0000-4000-8000-000000000001","nom":"Groupe C","date":"2026-12-02","heure_debut":"09:00","heure_fin":"12:00"}', '[]');
  perform test.ok(jsonb_array_length(detail_groupe('c0000000-0000-4000-8000-000000000003') -> 'activites') = 3, 'un nouveau groupe reçoit le déroulé des parties');

  perform test.ok(test.erreur(format('select ajouter_activite(%L, %L, %L)', 'c0000000-0000-4000-8000-000000000001', v_pre, gen_random_uuid())) like 'droits:Cette partie%',
                  'activité rattachée à une partie d’un autre atelier refusée');
end $$;

\echo '--- Élève : parties et ressources'
do $$
declare a jsonb;
begin
  perform test.comme('d0000000-0000-4000-8000-000000000001', true);
  select x into a from jsonb_array_elements(ateliers_eleve()) x where x -> 'groupe' ->> 'id' = 'c0000000-0000-4000-8000-000000000001';
  perform test.ok(a -> 'parties' -> 0 -> 'partie' ->> 'titre_fr' = 'IoT (capteurs)', 'l’élève voit les parties de son atelier');
  perform test.ok(a -> 'groupe' ->> 'statut' <> 'a_venir' and jsonb_array_length(a -> 'parties' -> 0 -> 'ressources') = 1, 'atelier démarré : code source visible');
  perform test.ok(test.erreur(format('select enregistrer_partie(%L)', '{"partie":{"atelier_id":"b0000000-0000-4000-8000-000000000001","titre_fr":"X"}}')) like 'droits:%',
                  'une tablette élève ne modifie pas les parties');
  perform test.ok(test.erreur(format('select appliquer_deroule(%L)', 'c0000000-0000-4000-8000-000000000001')) like 'permission denied%', 'déroulé : fonction interne fermée');
  perform test.ok(test.erreur(format('select export_resultats(%L)', test.id('camp'))) like 'droits:%', 'une tablette élève n’exporte pas');
end $$;

\echo '--- Export des résultats'
do $$
declare x jsonb;
begin
  perform test.comme('a0000000-0000-4000-8000-000000000002');
  perform test.ok(test.erreur(format('select export_resultats(%L)', test.id('camp'))) like 'droits:%', 'un formateur n’exporte pas tout le camp');
  perform test.comme('a0000000-0000-4000-8000-000000000001');
  x := export_resultats(test.id('camp'));
  perform test.ok(jsonb_array_length(x) > 0, 'lignes exportées');
  perform test.ok(exists (select 1 from jsonb_array_elements(x) l where l ->> 'partie' = 'IoT (capteurs)' and l ->> 'type' = 'pretest' and l -> 'eleve' ->> 'prenom' = 'Ama'),
                  'une ligne par élève, partie et activité');
  perform test.ok(exists (select 1 from jsonb_array_elements(x) l where l ->> 'type' = 'quiz' and l ? 'score'), 'les scores déjà obtenus sont repris');

  perform supprimer_partie(test.id('partie'));
  perform test.ok(jsonb_array_length(detail_groupe('c0000000-0000-4000-8000-000000000003') -> 'activites') = 0, 'partie supprimée : activités pas commencées retirées');
end $$;

\echo 'Tests des parties passés.'
