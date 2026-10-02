import { ref } from "vue"

// Runs Infini dont l'envoi a échoué (réseau, serveur down). Par catégorie, on
// ne garde que la meilleure en distance et la meilleure en cellules (souvent
// la même run) : le serveur ne retient que ces deux maxima, rien d'autre ne
// peut encore y entrer.
const KEY = "hibol-minesweeper:infinite-pending-submissions"
const CATEGORIES = ["clean", "assisted"]
const NUMERIC_FIELDS = [
  "maxDistance",
  "revealedCount",
  "minesTriggered",
  "heartsCollected",
  "robotsTriggered",
]

// Même dérivation que le serveur.
export function categoryOf(run) {
  return run.usedMachines ? "assisted" : "clean"
}

function emptyBoard() {
  return {
    clean: { distance: null, cells: null },
    assisted: { distance: null, cells: null },
  }
}

// Copie limitée aux champs du contrat serveur, null si l'un est invalide.
function sanitizeRun(raw) {
  if (
    !raw ||
    typeof raw.usedMachines !== "boolean" ||
    NUMERIC_FIELDS.some((field) => !Number.isFinite(raw[field]))
  ) {
    return null
  }

  const run = { usedMachines: raw.usedMachines }
  for (const field of NUMERIC_FIELDS) {
    run[field] = raw[field]
  }
  return run
}

function loadBoard() {
  const board = emptyBoard()

  try {
    const stored = JSON.parse(localStorage.getItem(KEY))

    for (const category of CATEGORIES) {
      for (const metric of ["distance", "cells"]) {
        const run = sanitizeRun(stored?.[category]?.[metric])
        // Une run rangée dans la mauvaise catégorie : stockage trafiqué.
        board[category][metric] =
          run && categoryOf(run) === category ? run : null
      }
    }
  } catch {
    // corrompu / indisponible : file vide
  }

  return board
}

export const pendingInfiniteRuns = ref(loadBoard())

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(pendingInfiniteRuns.value))
  } catch {
    // plein / indisponible : la file en mémoire reste bonne pour la session
  }
}

function setSlots(category, slots) {
  const current = pendingInfiniteRuns.value[category]
  if (current.distance === slots.distance && current.cells === slots.cells) {
    return
  }

  pendingInfiniteRuns.value = {
    ...pendingInfiniteRuns.value,
    [category]: slots,
  }
  persist()
}

function sameRun(a, b) {
  return a.maxDistance === b.maxDistance && a.revealedCount === b.revealedCount
}

export function savePendingInfiniteRun(raw) {
  const run = sanitizeRun(raw)
  if (!run) {
    return
  }

  const category = categoryOf(run)
  const { distance, cells } = pendingInfiniteRuns.value[category]

  setSlots(category, {
    distance:
      !distance || run.maxDistance > distance.maxDistance ? run : distance,
    cells: !cells || run.revealedCount > cells.revealedCount ? run : cells,
  })
}

// Retire `run` de la file (réponse définitive du serveur), ainsi que toute run
// en attente qui ne dépasse plus `serverBest` ({ maxDistance, revealedCount },
// les maxima renvoyés par le serveur après une soumission acceptée).
export function resolvePendingInfiniteRun(run, serverBest = null) {
  const category = categoryOf(run)
  const { distance, cells } = pendingInfiniteRuns.value[category]

  const keepDistance =
    distance &&
    !sameRun(distance, run) &&
    !(serverBest && distance.maxDistance <= serverBest.maxDistance)
  const keepCells =
    cells &&
    !sameRun(cells, run) &&
    !(serverBest && cells.revealedCount <= serverBest.revealedCount)

  setSlots(category, {
    distance: keepDistance ? distance : null,
    cells: keepCells ? cells : null,
  })
}

// Runs distinctes à renvoyer (une run championne des deux métriques n'est
// envoyée qu'une fois).
export function listPendingInfiniteRuns() {
  const runs = []

  for (const category of CATEGORIES) {
    const { distance, cells } = pendingInfiniteRuns.value[category]
    if (distance) {
      runs.push(distance)
    }
    if (cells && !(distance && sameRun(distance, cells))) {
      runs.push(cells)
    }
  }

  return runs
}

export function clearPendingInfiniteRuns() {
  pendingInfiniteRuns.value = emptyBoard()
  persist()
}
