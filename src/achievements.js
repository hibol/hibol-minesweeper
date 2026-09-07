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
  SPROUT_PIXELS,
  CHEST_PIXELS,
  TORNADO_PIXELS,
  GEM_PIXELS,
  CALENDAR_PIXELS,
  GEAR_PIXELS,
  SPARKLE_PIXELS,
  MACHINE_TRIO_PIXELS,
  COINS_PIXELS,
  PEACE_PIXELS
} from './icons'

const UNLOCKED_KEY = "hibol-minesweeper:achievements-unlocked"
const CLASSIC_LOSSES_KEY = "hibol-minesweeper:classic-losses"
const TREASURE_DAYS_KEY = "hibol-minesweeper:treasure-days-played"

// Définition statique (roadmap point 8) : id / titre / phrase / indice / icône.
// L'ordre ici est aussi l'ordre d'affichage de la page ACHIEVEMENTS
// (BurgerMenu.vue). `hint` est un teaser vague montré au tap sur une ligne
// encore verrouillée (à la place du "???"), sans révéler les seuils chiffrés
// que `description` donne une fois débloqué.
export const ACHIEVEMENTS = [
  {
    id: 'pro',
    title: 'PRO',
    description: "Cleared a classic game. You've got the basics down.",
    hint: 'Clear a classic game.',
    pixels: INFINITY_PIXELS
  },
  {
    id: 'ultra-pro',
    title: 'ULTRA PRO',
    description: 'Won without placing a single flag. Pure deduction.',
    hint: "Clear a classic game the purist's way.",
    pixels: DASHED_BORDER_PIXELS
  },
  {
    id: 'noob',
    title: 'NOOB',
    description: 'Lost 100 classic games. Everyone starts somewhere.',
    hint: 'Everyone pays their dues. Repeatedly.',
    pixels: MINE_PIXELS
  },
  {
    id: 'traveler',
    title: 'TRAVELER',
    description: 'Reached 100 cells from home. Getting somewhere.',
    hint: 'Put some distance between you and home.',
    pixels: RULER_PIXELS
  },
  {
    id: 'ultra-traveler',
    title: 'ULTRA TRAVELER',
    description: 'Reached 1000 cells from home. Are you even coming back?',
    hint: 'Put a lot of distance between you and home.',
    pixels: ROCKET_PIXELS
  },
  {
    id: 'hearty',
    title: 'HEARTY',
    description: "Found your first heart. The fog isn't so scary now.",
    hint: 'The fog hides more than mines.',
    pixels: HEART_PIXELS
  },
  {
    id: 'techy',
    title: 'TECHY',
    description: 'Met your first robot. Bip bop.',
    hint: 'The fog hides more than mines. This one beeps.',
    pixels: ROBOT_PIXELS
  },
  {
    id: 'iron-will',
    title: 'IRON WILL',
    description: 'Maxed out the darkness without a single heart. Grit, not luck.',
    hint: 'Reach the bottom of the darkness with nothing to soften it.',
    pixels: SHIELD_PIXELS
  },
  {
    id: 'squad',
    title: 'SQUAD',
    description: 'Triggered 5 robots in one run. Assemble!',
    hint: 'One robot is company. A few more is a squad.',
    pixels: SQUAD_PIXELS
  },
  {
    id: 'bouquet',
    title: 'BOUQUET',
    description: 'Collected 10 hearts in one run. A garden in the fog.',
    hint: 'One heart is nice. Keep going.',
    pixels: BOUQUET_PIXELS
  },
  {
    id: 'marathon',
    title: 'MARATHON',
    description: 'Revealed 42,195 cells in a single run — the marathon distance, one cell at a time.',
    hint: 'Cover a very specific, very long distance in one run.',
    pixels: FINISH_FLAG_PIXELS
  },
  {
    id: 'seed-hunter',
    title: 'SEED HUNTER',
    description: "Played someone else's seed. Curiosity has its own rewards.",
    hint: "Step into a world that isn't yours.",
    pixels: SPROUT_PIXELS
  },
  {
    id: 'treasure-hunter',
    title: 'TREASURE HUNTER',
    description: 'Found the chest for the first time. Somewhere out there, something was waiting.',
    hint: 'Somewhere out there, something is waiting to be found. Every day.',
    pixels: CHEST_PIXELS
  },
  {
    id: 'unscathed',
    title: 'UNSCATHED',
    description: 'Won a treasure hunt without losing a single life. Not a single misstep.',
    hint: 'Not a single misstep.',
    pixels: GEM_PIXELS
  },
  {
    id: 'storm-chaser',
    title: 'STORM CHASER',
    description: "Won a treasure hunt after a tornado relocated the chest. The chest doesn't stay put for storms.",
    hint: "The chest doesn't stay put for storms.",
    pixels: TORNADO_PIXELS
  },
  {
    id: 'creature-of-habit',
    title: 'CREATURE OF HABIT',
    description: 'Played the daily treasure hunt on 7 different days. Same time, every day.',
    hint: 'Same time, every day.',
    pixels: CALENDAR_PIXELS
  },
  {
    id: 'machine-lover',
    title: 'MACHINE LOVER',
    description: 'Bought your first utility machine. Every problem starts looking like a nail.',
    hint: 'Every problem starts looking like a nail.',
    pixels: GEAR_PIXELS
  },
  {
    id: 'fashionista',
    title: 'FASHIONISTA',
    description: 'Bought your first customization item. Function is optional.',
    hint: 'Some upgrades are just for looking good.',
    pixels: SPARKLE_PIXELS
  },
  {
    id: 'fully-equipped',
    title: 'FULLY EQUIPPED',
    description: 'Owned all 3 utility machines at once. A machine for every problem.',
    hint: 'A machine for every problem.',
    pixels: MACHINE_TRIO_PIXELS
  },
  {
    id: 'hoarder',
    title: 'HOARDER',
    description: 'Reached 10 reward saved up without ever spending it. Some people just like watching the number grow.',
    hint: 'Some people just like watching the number grow.',
    pixels: COINS_PIXELS
  },
  {
    id: 'pacifist',
    title: 'PACIFIST',
    description: 'Reached Traveler distance (100 cells) without triggering a single mine on the run. Careful hands, clean streak.',
    hint: 'Careful hands, clean streak.',
    pixels: PEACE_PIXELS
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

// "Hold" : le WinBanner (App.vue) occupe le même emplacement écran que
// AchievementBanner. À la victoire classic, unlockAchievement('pro') tourne
// AVANT que le WinBanner s'affiche (deux watchers séparés sur game.status,
// celui des achievements créé en premier) — donc App.vue met la file en
// pause le temps du WinBanner et la relance à sa fermeture. Un achievement
// déjà à l'écran à ce moment-là est remis en tête de file.
let held = false

function showNext() {
  if (held) {
    return
  }

  currentAchievementBanner.value = queue.shift() ?? null
}

export function dismissAchievementBanner() {
  showNext()
}

export function holdAchievementBanners() {
  held = true

  if (currentAchievementBanner.value) {
    queue.unshift(currentAchievementBanner.value)
    currentAchievementBanner.value = null
  }
}

export function resumeAchievementBanners() {
  if (!held) {
    return
  }

  held = false
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

// "Creature of Habit" : compteur cumulatif de jours de chasse au trésor
// résolus (gagnés OU perdus), même principe que classicLosses ci-dessus —
// treasureLog.js plafonne ses entrées à 60, donc on ne peut pas s'y fier pour
// un seuil. Appelé une fois par jour résolu depuis App.vue
// (recordTreasureDayIfReal), jamais en mode DEV.
const CREATURE_OF_HABIT_THRESHOLD = 7
let treasureDaysPlayed = Number(localStorage.getItem(TREASURE_DAYS_KEY)) || 0

export function recordTreasureDayPlayed() {
  treasureDaysPlayed++
  localStorage.setItem(TREASURE_DAYS_KEY, treasureDaysPlayed)

  if (treasureDaysPlayed >= CREATURE_OF_HABIT_THRESHOLD) {
    unlockAchievement('creature-of-habit')
  }
}

// "Hoarder" : avoir au moins HOARDER_THRESHOLD de reward en réserve, à
// n'importe quel moment (pas de contrainte "jamais dépensé"). checkHoarder est
// appelé à chaque gain de reward (App.vue, victoire de chasse) et une fois au
// démarrage.
const HOARDER_THRESHOLD = 10

export function checkHoarder(balance) {
  if (balance >= HOARDER_THRESHOLD) {
    unlockAchievement('hoarder')
  }
}
