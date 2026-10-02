import { ref } from "vue"
import { playerId, PLAYER_ID_KEY } from "./playerId"

// Fusions d'identité pas encore confirmées par le serveur (envoyées par
// accountOnline.js retryPendingIdentityMerges) : { from, to }, dans l'ordre où
// elles ont eu lieu — une chaîne A→B puis B→C doit passer dans cet ordre.
const KEY = "hibol-minesweeper:pending-identity-merges"
export { KEY as PENDING_IDENTITY_MERGES_KEY }

function isValid(merge) {
  return (
    typeof merge?.from === "string" &&
    typeof merge?.to === "string" &&
    merge.from !== "" &&
    merge.to !== "" &&
    merge.from !== merge.to
  )
}

function onlyValid(merges) {
  return merges.filter(isValid).map(({ from, to }) => ({ from, to }))
}

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(stored) ? onlyValid(stored) : []
  } catch {
    return []
  }
}

export const pendingIdentityMerges = ref(load())

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(pendingIdentityMerges.value))
  } catch {
    // plein / indisponible : la file en mémoire reste bonne pour la session
  }
}

export function queueIdentityMerge(from, to) {
  const merges = onlyValid([{ from, to }])
  if (merges.length === 0) {
    return
  }

  pendingIdentityMerges.value = [...pendingIdentityMerges.value, ...merges]
  persist()
}

// Par valeur, pas "la 1re de la file" : deux envois concurrents de la même
// fusion (boot + retour réseau) ne doivent pas en faire sauter une autre.
export function resolveIdentityMerge({ from, to }) {
  const index = pendingIdentityMerges.value.findIndex(
    (merge) => merge.from === from && merge.to === to,
  )
  if (index === -1) {
    return
  }

  pendingIdentityMerges.value = pendingIdentityMerges.value.filter(
    (_, i) => i !== index,
  )
  persist()
}

export function clearPendingIdentityMerges() {
  pendingIdentityMerges.value = []
  persist()
}

// Import de sauvegarde (cf. App.vue onImportSave), en deux temps autour de
// l'écrasement du stockage. Avant : la file de CET appareil, plus sa fusion
// vers l'identité du fichier.
export function captureIdentityMergesForImport(importedData) {
  return [
    ...pendingIdentityMerges.value,
    { from: playerId, to: importedData[PLAYER_ID_KEY] },
  ]
}

// Après : le stockage est celui du fichier, qui a sa propre file ; on lui
// ajoute ce qui a été capturé. Envoyé au rechargement.
export function queueIdentityMergesAfterImport(captured) {
  pendingIdentityMerges.value = [...load(), ...onlyValid(captured)]
  persist()
}
