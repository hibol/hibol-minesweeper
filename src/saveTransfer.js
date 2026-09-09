// Sauvegarde exportable / importable (Settings → Backup). Toutes les clés
// localStorage du jeu tiennent sous le préfixe PREFIX ; un export en emballe
// une copie dans un fichier JSON signé.
//
// La signature (HMAC-SHA256, secret embarqué) n'est PAS de la sécurité — le
// secret est dans le bundle et localStorage s'édite dans les devtools. C'est
// un contrôle d'intégrité : il refuse un fichier tronqué, corrompu ou édité à
// la main (le scénario "je passe chest-reward à 10000 et je réimporte"). Le
// vrai anti-triche viendra avec la validation côté serveur (leaderboards).

const PREFIX = 'hibol-minesweeper:'
const APP_ID = 'hibol-minesweeper'

// Le champ `version` du wrapper : bump quand le format évolue. verifyAndParse
// refuse un fichier d'une version plus récente que celle-ci.
export const SAVE_FORMAT_VERSION = 1

const SAVE_SECRET = 'hbl-mnswpr-save-v1-8f3a9c2e5d71b064a1'

function collectData() {
  const data = {}

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) {
      data[key] = localStorage.getItem(key)
    }
  }

  return data
}

// Chaîne signée stable : clés triées, pour que l'ordre d'itération de
// localStorage (non garanti) n'influe pas sur la signature.
function canonical(data) {
  return JSON.stringify(data, Object.keys(data).sort())
}

async function sign(message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SAVE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(message))

  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function buildExport() {
  const data = collectData()
  const sig = await sign(canonical(data))

  return {
    app: APP_ID,
    version: SAVE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    sig
  }
}

// Renvoie { ok: true, data } ou { ok: false, error } (message court, affiché
// tel quel dans un toast).
export async function verifyAndParse(text) {
  let parsed

  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not a valid file' }
  }

  if (!parsed || typeof parsed !== 'object' || parsed.app !== APP_ID) {
    return { ok: false, error: 'not a hibol minesweeper save' }
  }

  if (typeof parsed.version === 'number' && parsed.version > SAVE_FORMAT_VERSION) {
    return { ok: false, error: 'save is from a newer version of the game' }
  }

  const { data, sig } = parsed

  if (!data || typeof data !== 'object' || typeof sig !== 'string') {
    return { ok: false, error: 'save file is incomplete' }
  }

  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(PREFIX) || typeof value !== 'string') {
      return { ok: false, error: 'save file is malformed' }
    }
  }

  let expected

  try {
    expected = await sign(canonical(data))
  } catch {
    return { ok: false, error: 'could not read save file' }
  }

  if (sig !== expected) {
    return { ok: false, error: 'save file has been modified' }
  }

  return { ok: true, data }
}
