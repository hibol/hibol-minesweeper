import { ref, watch } from 'vue'

const HAS_FOUND_HEART_KEY = "hibol-minesweeper:has-found-heart"
const HAS_FOUND_ROBOT_KEY = "hibol-minesweeper:has-found-robot"

// Distinct de runHistory.js (des runs terminées) et settings.js (des
// préférences réglables) : ce sont des jalons de découverte qui survivent
// aux runs et aux parties perdues/abandonnées — le tout premier cœur/robot
// croisé, jamais réinitialisé une fois vrai. Stockés séparément (pas un seul
// booléen combiné) en prévision des achievements (roadmap point 8) qui
// voudront très probablement un jalon "premier cœur" et un "premier robot"
// distincts plutôt qu'un seul "case spéciale trouvée".
export const hasFoundHeart = ref(localStorage.getItem(HAS_FOUND_HEART_KEY) === "true")
export const hasFoundRobot = ref(localStorage.getItem(HAS_FOUND_ROBOT_KEY) === "true")

export function markHeartFound() {
  hasFoundHeart.value = true
}

export function markRobotFound() {
  hasFoundRobot.value = true
}

// Écrit seulement quand value devient true : ces jalons ne redeviennent
// jamais false (pas de setItem sur false), donc pas besoin d'écrire à
// chaque toggle comme les vrais réglages de settings.js.
watch(hasFoundHeart, (value) => {
  if (value) {
    localStorage.setItem(HAS_FOUND_HEART_KEY, "true")
  }
})

watch(hasFoundRobot, (value) => {
  if (value) {
    localStorage.setItem(HAS_FOUND_ROBOT_KEY, "true")
  }
})
