// File d'attente des réponses quand le réseau coupe pendant un test.
// La réponse est gardée sur la tablette puis renvoyée dès que la connexion revient ;
// l'élève continue son test sans attendre. La notation reste faite par le serveur.

export interface ReponseEnAttente {
  tentativeId: string
  questionId: string
  choix_coches: string[]
  texte?: string
  temps_ms: number
}

const CLE = 'camp-caysti:reponses-en-attente'

function lire(): ReponseEnAttente[] {
  try { return JSON.parse(localStorage.getItem(CLE) ?? '[]') as ReponseEnAttente[] } catch { return [] }
}
function ecrire(liste: ReponseEnAttente[]) {
  try { localStorage.setItem(CLE, JSON.stringify(liste)) } catch { /* stockage indisponible : la réponse reste en mémoire */ }
}

let memoire: ReponseEnAttente[] = lire()

export function mettreEnAttente(r: ReponseEnAttente) {
  // une nouvelle réponse à la même question remplace l'ancienne
  memoire = [...memoire.filter((x) => !(x.tentativeId === r.tentativeId && x.questionId === r.questionId)), r]
  ecrire(memoire)
}

export function enAttente(tentativeId?: string) {
  return memoire.filter((r) => !tentativeId || r.tentativeId === tentativeId)
}

/** Renvoie les réponses en attente ; s'arrête à la première qui échoue encore pour cause de réseau. */
export async function vider(envoyer: (r: ReponseEnAttente) => Promise<void>, tentativeId?: string): Promise<boolean> {
  for (const r of enAttente(tentativeId)) {
    try {
      await envoyer(r)
    } catch (e) {
      if ((e as { code?: string }).code === 'reseau') return false
      // refus définitif du serveur (tentative close, question hors fiche) : inutile de réessayer
    }
    memoire = memoire.filter((x) => x !== r)
    ecrire(memoire)
  }
  return true
}
