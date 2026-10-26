-- Illustration affichée en tête de chaque atelier sur l'accueil élève
-- (chemin dans Supabase Storage). Les questions et les choix ont déjà leur colonne image.
alter table atelier add column image text;
