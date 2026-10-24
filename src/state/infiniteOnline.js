import { playerId, onlineSuspended } from "./playerId"
import { pushToast } from "./toastQueue"
import { sendClaimingUsername } from "./accountOnline"
import { usernameChoice } from "./usernameChoice"
import { usernamePrompted } from "./username"
import {
  savePendingInfiniteRun,
  resolvePendingInfiniteRun,
  listPendingInfiniteRuns,
} from "./infinitePendingSubmissions"
import { getJson, postJson } from "./onlineApi"
import { exceedsPushed, markPushed } from "./infinitePushed"

// Refus qui visent la run elle-même : inutile de la renvoyer un jour.
const RUN_REFUSAL_REASONS = ["invalid_stats", "invalid_request"]

// La run telle que l'envoie le contrat serveur, depuis une partie vivante...
export function runFromGame(game) {
  return {
    usedMachines: game.usedMachines,
    maxDistance: game.maxDistance,
    revealedCount: game.revealedCount,
    minesTriggered: game.minesTriggeredCount,
    heartsCollected: game.heartsCollectedCount,
    robotsTriggered: game.robotsTriggeredCount,
    windMachineUses: game.machineUses.windMachine,
    travelMachineUses: game.machineUses.travelMachine,
    xrayMachineUses: game.machineUses.xrayMachine,
  }
}

// ... ou depuis un snapshot sauvegardé (anciens snapshots : champs absents à 0).
export function runFromSnapshot(snapshot) {
  const uses = snapshot.machineUses ?? {}
  return {
    usedMachines: snapshot.usedMachines ?? false,
    maxDistance: snapshot.maxDistance,
    revealedCount: snapshot.revealedCount,
    minesTriggered: snapshot.minesTriggeredCount ?? 0,
    heartsCollected: snapshot.heartsCollectedCount ?? 0,
    robotsTriggered: snapshot.robotsTriggeredCount ?? 0,
    windMachineUses: uses.windMachine ?? 0,
    travelMachineUses: uses.travelMachine ?? 0,
    xrayMachineUses: uses.xrayMachine ?? 0,
  }
}

// Envoie une run et tient la file d'attente à jour. Renvoie la réponse du
// serveur, ou null si l'envoi a échoué (run mise en attente).
async function sendRun(run, { keepalive = false } = {}) {
  let result
  try {
    result = await sendClaimingUsername((usernameToSend) =>
      postJson(
        "/api/infinite/submissions",
        {
          playerId,
          username: usernameToSend,
          usedMachines: run.usedMachines,
          maxDistance: run.maxDistance,
          revealedCount: run.revealedCount,
          minesTriggered: run.minesTriggered,
          heartsCollected: run.heartsCollected,
          robotsTriggered: run.robotsTriggered,
          windMachineUses: run.windMachineUses,
          travelMachineUses: run.travelMachineUses,
          xrayMachineUses: run.xrayMachineUses,
        },
        { keepalive },
      ),
    )
  } catch {
    savePendingInfiniteRun(run)
    return null
  }

  if (result.accepted) {
    // `result` porte les maxima du serveur pour cette catégorie.
    resolvePendingInfiniteRun(run, result)
    markPushed(run, result)
  } else if (RUN_REFUSAL_REASONS.includes(result.reason)) {
    resolvePendingInfiniteRun(run)
  } else {
    // Refus lié au pseudo (username_taken, invalid_username, pseudo à choisir) : la run reste
    // valable, elle repartira sous le nouveau nom.
    savePendingInfiniteRun(run)
  }

  return result
}

// Soumet une run Infini (au Give Up) au classement en ligne. Le score est
// aussi poussé en cours de partie (pushInfiniteProgress). Pas de rejeu
// anti-triche : le client déclare ses stats, le serveur applique ses bornes de
// vraisemblance et dérive `category` de usedMachines. Le score local
// (runHistory.js) est acquis indépendamment : un échec n'est jamais remonté
// au joueur, la run part en file d'attente (infinitePendingSubmissions.js).
export async function submitInfiniteRun(run) {
  if (onlineSuspended) {
    return
  }

  // Pseudo à choisir : la run attend le nouveau nom, sans aucun envoi.
  if (usernameChoice.value) {
    savePendingInfiniteRun(run)
    return
  }

  // Avant l'envoi : le serveur répond `improved` aussi à l'égalité, donc une
  // run déjà poussée en cours de partie ne doit pas être annoncée comme record.
  const beatsPushed = exceedsPushed(run)
  const result = await sendRun(run)

  if (result?.accepted && result.improved && beatsPushed) {
    // `improved` ne dit pas laquelle des deux métriques a été battue (cf.
    // contrat serveur) — message générique plutôt que de nommer "cells" à
    // tort pour une run qui n'aurait amélioré que la distance.
    pushToast("New personal best!", {
      durationMs: 4000,
    })
  }
}

// Pousse une run en cours (reprise, classement ouvert, départ, palier de
// cases). Silencieux, et sans envoi si elle ne dépasse pas ce que le serveur a
// déjà ; en cas d'échec elle rejoint la file comme une run finie. Jamais de
// choix de pseudo ici : le dialogue attend la fin de partie. Rien ne part non
// plus avant le premier choix : le serveur garderait un nom tiré au hasard.
export async function pushInfiniteProgress(run, { keepalive = false } = {}) {
  if (
    onlineSuspended ||
    !usernamePrompted.value ||
    usernameChoice.value ||
    !Number.isFinite(run?.revealedCount) ||
    !Number.isFinite(run.maxDistance) ||
    !exceedsPushed(run)
  ) {
    return
  }

  await sendRun(run, { keepalive })
}

// Renvoie les runs en attente, au boot et au retour du réseau (cf. onlineQueues.js).
// Sans toast : le joueur ne relierait pas un record annoncé à froid à une run
// jouée hors ligne il y a longtemps.
export async function retryPendingInfiniteRuns() {
  // Pas de renvoi en boucle tant qu'aucun pseudo n'est choisi.
  if (onlineSuspended || usernameChoice.value) {
    return
  }

  for (const run of listPendingInfiniteRuns()) {
    // Toujours hors ligne : inutile d'essayer les suivantes.
    if (!(await sendRun(run))) {
      return
    }
  }
}

// Classement en ligne Infini, déjà trié décroissant par le serveur (plus grand
// = mieux, contrairement à Legacy) — le rang, c'est l'index + 1, pas de champ
// `rank` par entrée (même principe que fetchLegacyLeaderboard). `cleanOnly` :
// seulement les runs sans machine. Sinon, meilleure ligne de chaque joueur
// parmi les deux catégories (le top 50 de la fusion est exact : le meilleur
// score d'un joueur du top 50 est dans le top 50 de sa catégorie). Lève en cas
// d'échec réseau/HTTP : à l'appelant de décider de l'affichage (cf.
// menu/InfiniteRunsPage.vue).
export async function fetchInfiniteLeaderboard(metric, cleanOnly, limit = 50) {
  const fetchCategory = (category) =>
    getJson(
      `/api/infinite/leaderboard?metric=${metric}&category=${category}&limit=${limit}`,
    )

  if (cleanOnly) {
    return fetchCategory("clean")
  }

  const [clean, assisted] = await Promise.all([
    fetchCategory("clean"),
    fetchCategory("assisted"),
  ])

  // Pseudos uniques côté serveur. À égalité, la ligne clean (vue en premier) reste.
  const bestByPlayer = new Map()
  for (const row of [...clean, ...assisted]) {
    const known = bestByPlayer.get(row.username)
    if (!known || row.value > known.value) {
      bestByPlayer.set(row.username, row)
    }
  }

  return [...bestByPlayer.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}
