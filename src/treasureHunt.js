import { ref } from 'vue'

// Persistance de la chasse au trésor (roadmap point 10). Deux choses ici :
//  1. un unique snapshot "partie en cours" pour survivre à un reload / onglet
//     tué en arrière-plan (clé …:treasure-hunt:current) ;
//  2. le compteur de récompense cumulé, persistant entre les jours
//     (clé …:chest-reward) — nom générique "chestReward" tant qu'il n'y a
//     rien à acheter avec (décision 2026-09-03).
//
// La vraie mécanique "une partie par jour, 3 tentatives" n'est pas encore
// branchée sur un bouton : en v0 le mode passe par le bouton DEV, avec une
// seed aléatoire et des tentatives illimitées. treasureDayKey/treasureDaySeed
// ci-dessous sont là, prêts pour le vrai bouton, mais pas encore utilisés en
// jeu réel.

const CURRENT_KEY = 'hibol-minesweeper:treasure-hunt:current'
const REWARD_KEY = 'hibol-minesweeper:chest-reward'

// Date LOCALE au format AAAAMMJJ — bascule à minuit local (décision
// 2026-09-03 ; on passera à UTC si un classement global apparaît un jour).
export function treasureDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// Seed du jour = l'entier AAAAMMJJ lui-même : déterministe, partagé par tous
// les joueurs le même jour.
export function treasureDaySeed(date = new Date()) {
  return Number(treasureDayKey(date))
}

export function loadTreasureGame() {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveTreasureGame(snapshot) {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(snapshot))
  } catch {
    // localStorage plein / indisponible (navigation privée) : tant pis pour
    // la sauvegarde, la partie en cours n'est pas affectée.
  }
}

export function clearTreasureGame() {
  try {
    localStorage.removeItem(CURRENT_KEY)
  } catch {
    // idem saveTreasureGame
  }
}

function loadReward() {
  const n = Number(localStorage.getItem(REWARD_KEY))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

// Ref partagée (singleton), même pattern que settings.js : n'importe quel
// composant qui l'importe lit la même valeur réactive, sans props/events.
export const chestReward = ref(loadReward())

export function addChestReward(amount = 1) {
  chestReward.value += amount

  try {
    localStorage.setItem(REWARD_KEY, String(chestReward.value))
  } catch {
    // idem saveTreasureGame
  }
}
