import { ref, watch } from 'vue'
import {
  INFINITY_PIXELS,
  DASHED_BORDER_PIXELS,
  MINE_PIXELS,
  RULER_PIXELS,
  ROCKET_PIXELS,
  HEART_PIXELS,
  ROBOT_PIXELS,
  SHIELD_PIXELS,
  SQUAD_PIXELS,
  BOUQUET_PIXELS,
  FINISH_FLAG_PIXELS,
  SPROUT_PIXELS
} from './icons'

const UNLOCKED_KEY = "hibol-minesweeper:achievements-unlocked"
const CLASSIC_LOSSES_KEY = "hibol-minesweeper:classic-losses"

// Définition statique (roadmap point 8) : id / titre / phrase / icône. L'ordre
// ici est aussi l'ordre d'affichage de la page ACHIEVEMENTS (BurgerMenu.vue).
export const ACHIEVEMENTS = [
  {
    id: 'pro',
    title: 'PRO',
    description: "Cleared a classic game. You've got the basics down.",
    pixels: INFINITY_PIXELS
  },
  {
    id: 'ultra-pro',
    title: 'ULTRA PRO',
    description: 'Won without placing a single flag. Pure deduction.',
    pixels: DASHED_BORDER_PIXELS
  },
  {
    id: 'noob',
    title: 'NOOB',
    description: 'Lost 100 classic games. Everyone starts somewhere.',
    pixels: MINE_PIXELS
  },
  {
    id: 'traveler',
    title: 'TRAVELER',
    description: 'Reached 100 cells from home. Getting somewhere.',
    pixels: RULER_PIXELS
  },
  {
    id: 'ultra-traveler',
    title: 'ULTRA TRAVELER',
    description: 'Reached 1000 cells from home. Are you even coming back?',
    pixels: ROCKET_PIXELS
  },
  {
    id: 'hearty',
    title: 'HEARTY',
    description: "Found your first heart. The fog isn't so scary now.",
    pixels: HEART_PIXELS
  },
  {
    id: 'techy',
    title: 'TECHY',
    description: 'Met your first robot. Bip bop.',
    pixels: ROBOT_PIXELS
  },
  {
    id: 'iron-will',
    title: 'IRON WILL',
    description: 'Maxed out the darkness without a single heart. Grit, not luck.',
    pixels: SHIELD_PIXELS
  },
  {
    id: 'squad',
    title: 'SQUAD',
    description: 'Triggered 5 robots in one run. Assemble!',
    pixels: SQUAD_PIXELS
  },
  {
    id: 'bouquet',
    title: 'BOUQUET',
    description: 'Collected 10 hearts in one run. A garden in the fog.',
    pixels: BOUQUET_PIXELS
  },
  {
    id: 'marathon',
    title: 'MARATHON',
    description: 'Revealed 42,195 cells in a single run — the marathon distance, one cell at a time.',
    pixels: FINISH_FLAG_PIXELS
  },
  {
    id: 'seed-hunter',
    title: 'SEED HUNTER',
    description: "Played someone else's seed. Curiosity has its own rewards.",
    pixels: SPROUT_PIXELS
  }
]

function loadUnlocked() {
  try {
    return JSON.parse(localStorage.getItem(UNLOCKED_KEY)) ?? {}
  } catch {
    return {}
  }
}

// { [id]: timestamp } — la page ACHIEVEMENTS (BurgerMenu.vue) lit ça
// directement pour savoir quoi afficher vs. masquer en "???".
export const unlockedAchievements = ref(loadUnlocked())

watch(unlockedAchievements, (value) => {
  localStorage.setItem(UNLOCKED_KEY, JSON.stringify(value))
})

// File FIFO pour le banner (AchievementBanner.vue) — même principe que
// toastQueue.js mais un composant différent (banner style WinBanner, pas un
// toast, cf. discussion du 2026-08-28) : plusieurs achievements peuvent en
// théorie se débloquer coup sur coup, un seul affiché à la fois.
export const currentAchievementBanner = ref(null)
const queue = []

function showNext() {
  currentAchievementBanner.value = queue.shift() ?? null
}

export function dismissAchievementBanner() {
  showNext()
}

export function unlockAchievement(id) {
  if (unlockedAchievements.value[id]) {
    return
  }

  const achievement = ACHIEVEMENTS.find((a) => a.id === id)

  if (!achievement) {
    return
  }

  unlockedAchievements.value = { ...unlockedAchievements.value, [id]: Date.now() }
  queue.push(achievement)

  if (!currentAchievementBanner.value) {
    showNext()
  }
}

// Compteur de défaites classic, cumulatif à travers les sessions — rien
// d'autre dans le projet ne suit ça aujourd'hui (runHistory.js n'enregistre
// que les runs infinies terminées). Sert uniquement "Noob" ; vit ici plutôt
// que dans un module partagé puisque rien d'autre n'en a besoin.
const NOOB_THRESHOLD = 100
let classicLosses = Number(localStorage.getItem(CLASSIC_LOSSES_KEY)) || 0

export function recordClassicLoss() {
  classicLosses++
  localStorage.setItem(CLASSIC_LOSSES_KEY, classicLosses)

  if (classicLosses >= NOOB_THRESHOLD) {
    unlockAchievement('noob')
  }
}
