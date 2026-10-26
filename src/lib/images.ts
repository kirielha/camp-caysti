// Préparation des images ajoutées aux questions.
// Les photos sont réduites et compressées sur l'appareil avant d'être stockées :
// une tablette en 3G ne doit pas télécharger des photos de 4 Mo à chaque question.
// (En mode Supabase, le résultat sera envoyé dans Storage au lieu d'être gardé en data URL.)

export const TAILLE_MAX_FICHIER = 8 * 1024 * 1024 // refus au-delà de 8 Mo avant compression

export async function preparerImage(fichier: File, cote = 800): Promise<string> {
  if (!fichier.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.')
  if (fichier.size > TAILLE_MAX_FICHIER) throw new Error('Image trop lourde (8 Mo maximum).')

  const source = await lireDataUrl(fichier)
  // Les SVG (illustrations vectorielles) restent tels quels : ils sont déjà légers
  if (fichier.type === 'image/svg+xml') return source

  const img = await charger(source)
  const echelle = Math.min(1, cote / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * echelle)
  canvas.height = Math.round(img.height * echelle)
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.fillStyle = '#ffffff' // fond blanc pour les PNG transparents convertis en JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const webp = canvas.toDataURL('image/webp', 0.82)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82)
}

function lireDataUrl(f: File): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader()
    r.onload = () => ok(r.result as string)
    r.onerror = () => ko(new Error('Impossible de lire ce fichier.'))
    r.readAsDataURL(f)
  })
}

function charger(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = () => ko(new Error('Image illisible.'))
    img.src = src
  })
}

/** Illustrations de démo proposées dans l'éditeur (public/demo). */
export const ILLUSTRATIONS = [
  'robot', 'ultrason', 'infrarouge', 'lumiere', 'moteur', 'servo', 'led', 'bouton', 'pile', 'solaire',
  'camera', 'micro', 'roue', 'ecran', 'hautparleur', 'imprimante3d', 'pla', 'couches', 'trancheur',
  'fer', 'bois', 'verre',
].map((nom) => `demo/${nom}.svg`)
