import { ref, watch } from 'vue'

const USERNAME_KEY = "hibol-minesweeper:username"
// Distinct de "un username est renseigné" : on retient qu'on a DÉJÀ proposé le
// choix au tout premier lancement, pour ne pas le redemander à quelqu'un qui a
// délibérément laissé vide. Un vrai mécanisme anti-doublon (type "player5233"
// attribué d'office) viendra avec le classement en ligne — hors sujet ici, on
// se contente de stocker le nom tel quel côté client.
const USERNAME_PROMPTED_KEY = "hibol-minesweeper:username-prompted"

// Aligné sur le maxlength du champ (cf. UsernameDialog.vue) — la coupe dans
// setUsername n'est qu'une ceinture-bretelles côté donnée.
export const MAX_USERNAME_LENGTH = 12

// Refs partagées (singleton), même principe que settings.js : n'importe quel
// composant qui importe `username` lit le même état réactif.
export const username = ref(localStorage.getItem(USERNAME_KEY) ?? "")
export const usernamePrompted = ref(localStorage.getItem(USERNAME_PROMPTED_KEY) === "true")

export function setUsername(value) {
  username.value = value.trim().slice(0, MAX_USERNAME_LENGTH)
}

export function markUsernamePrompted() {
  usernamePrompted.value = true
}

watch(username, (value) => {
  localStorage.setItem(USERNAME_KEY, value)
})

// N'écrit que quand ça passe à true (jamais remis à false hors "Reset
// everything", qui efface toutes les clés et recharge) — même logique que les
// jalons de discoveries.js.
watch(usernamePrompted, (value) => {
  if (value) {
    localStorage.setItem(USERNAME_PROMPTED_KEY, "true")
  }
})
