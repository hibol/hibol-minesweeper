import { MAX_OPENING_REVEAL } from "./game/game"

// Modes qui ont chacun leur slot de sauvegarde (cf. gameStorage.js).
export const MODES = ["classic", "infinite", "treasure", "legacy"]

// Une partie "qui vaut la peine d'être gardée" — seuil de la confirmation de
// discard, par mode (extensible). En infini, l'ouverture automatique de départ
// ne compte pas comme de la vraie progression.
export function isMeaningfulProgress(mode, status, revealedCount) {
  if (status !== "playing") {
    return false
  }
  return mode === "infinite"
    ? revealedCount > MAX_OPENING_REVEAL
    : revealedCount > 0
}

export function isMeaningfulRun(game) {
  return isMeaningfulProgress(game.mode, game.status, game.revealedCount)
}

// Mode dans lequel rouvrir l'app, d'après le dernier mode joué (null = jamais).
// Les garde-fous s'appliquent dans cet ordre, le suivant jugeant le résultat du
// précédent :
// 1. infini et trésor partagent le même verrou : verrouillés → classic ;
// 2. Legacy pas acheté (ou "Reset everything" entre-temps) → classic ;
// 3. une fois Legacy acheté il remplace le classic dans le header → Legacy.
export function chooseBootMode({ lastMode, infiniteUnlocked, legacyUnlocked }) {
  let mode = lastMode ?? "classic"

  if ((mode === "infinite" || mode === "treasure") && !infiniteUnlocked) {
    mode = "classic"
  }
  if (mode === "legacy" && !legacyUnlocked) {
    mode = "classic"
  }
  if (mode === "classic" && legacyUnlocked) {
    mode = "legacy"
  }

  return mode
}

// Mode de base du header quand la chasse du jour est déjà jouée et ne peut pas
// être rouverte.
export function fallbackBootMode(legacyUnlocked) {
  return legacyUnlocked ? "legacy" : "classic"
}
