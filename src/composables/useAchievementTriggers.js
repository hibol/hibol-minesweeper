import { watch } from 'vue'
import { unlockAchievement } from '../achievements'
import { markHeartFound, markRobotFound } from '../discoveries'
import { canGiveUp } from '../game/game'

// Débloque les achievements (et pose les jalons découverte cœur/robot) à partir
// des compteurs de `game`. Sorti d'App.vue sans changement : aucun état local,
// que des effets. Getters `() => game.value.X` — pas `game.value.X` direct —
// pour suivre une partie remplacée sans réabonner ; `immediate` couvre une
// partie restaurée déjà au-dessus d'un seuil au montage.
export function useAchievementTriggers(game) {
  watch(
    () => game.value.heartsCollectedCount,
    (count) => {
      if (count > 0) {
        markHeartFound()
        unlockAchievement('hearty')
      }
      if (count >= 10) {
        unlockAchievement('bouquet')
      }
    },
    { immediate: true },
  )

  watch(
    () => game.value.robotsTriggeredCount,
    (count) => {
      if (count > 0) {
        markRobotFound()
        unlockAchievement('techy')
      }
      if (count >= 5) {
        unlockAchievement('squad')
      }
    },
    { immediate: true },
  )

  // Traveler/Ultra Traveler : cumulatif toutes runs. Pacifist : 100 cases sans
  // mine déclenchée sur CETTE run infinie (la chasse a son propre "Unscathed").
  watch(
    () => game.value.maxDistance,
    (distance) => {
      if (distance >= 100) {
        unlockAchievement('traveler')
        if (game.value.mode === 'infinite' && game.value.minesTriggeredCount === 0) {
          unlockAchievement('pacifist')
        }
      }
      if (distance >= 1000) {
        unlockAchievement('ultra-traveler')
      }
    },
    { immediate: true },
  )

  // Marathon : 42195 cases = la distance d'un marathon en mètres.
  watch(
    () => game.value.revealedCount,
    (count) => {
      if (count >= 42195) {
        unlockAchievement('marathon')
      }
    },
    { immediate: true },
  )

  // Iron Will : à l'instant où canGiveUp passe à vrai, si aucun cœur n'a amorti.
  watch(
    () => canGiveUp(game.value),
    (can) => {
      if (can && game.value.heartsCollectedCount === 0) {
        unlockAchievement('iron-will')
      }
    },
  )
}
