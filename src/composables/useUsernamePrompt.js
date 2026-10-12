import { ref, shallowRef, computed, watchEffect } from "vue"
import { isMeaningfulRun } from "../gameModes"
import { usernamePrompted, markUsernamePrompted } from "../state/username"
import { usernameChoice } from "../state/usernameChoice"
import { retryOnlineQueues } from "../state/onlineQueues"

// Dialogues de pseudo : celui du tout premier lancement, et « nouveau pseudo »
// (nom refusé en ligne ou compte supprimé, cf. usernameChoice.js). Le popup
// tap/long-press (`maybeShowTapIntro`) attend la fin du premier dialogue pour
// ne pas s'empiler dessus.
export function useUsernamePrompt(game, { maybeShowTapIntro }) {
  // Il est déjà enregistré quand le dialogue se ferme (claimUsername /
  // completeDeviceLink, sans troncature pour un nom venu du serveur).
  const showUsernameDialog = ref(false)

  // Variante « nouveau pseudo » : copie de usernameChoice figée à l'ouverture,
  // pour que le dialogue ne change pas sous les yeux du joueur (un pairage
  // réussi efface usernameChoice avant l'écran final).
  const usernameRetry = ref(null)

  // Partie au sens « ne pas interrompre » : progression réelle (cf.
  // isMeaningfulRun : au moins une case ouverte, au-delà de l'ouverture auto
  // en Infini) et pas encore finie. Une partie reprise au démarrage ne compte
  // qu'une fois rejouée dans cette session. shallowRef : seule l'identité de
  // la partie compte, inutile de la rendre réactive en profondeur une 2e fois.
  const resumedAtBoot = shallowRef(null)
  const gameInProgress = computed(
    () =>
      isMeaningfulRun(game.value) &&
      !(
        game.value === resumedAtBoot.value?.game &&
        game.value.revealedCount === resumedAtBoot.value.revealedCount
      ),
  )

  // Un pseudo à choisir n'interrompt jamais une partie : le dialogue s'ouvre
  // dès qu'on est entre deux parties (démarrage, fin, abandon, nouvelle
  // partie).
  watchEffect(() => {
    if (
      usernameChoice.value &&
      usernamePrompted.value &&
      !showUsernameDialog.value &&
      !usernameRetry.value &&
      !gameInProgress.value
    ) {
      usernameRetry.value = { ...usernameChoice.value }
    }
  })

  // À appeler au montage, APRÈS le choix de la partie de départ : c'est elle
  // que resumedAtBoot retient, avant que le watchEffect puisse rouvrir un
  // dialogue sur une partie reprise.
  function promptAtBoot() {
    resumedAtBoot.value = {
      game: game.value,
      revealedCount: game.value.revealedCount,
    }

    if (!usernamePrompted.value) {
      showUsernameDialog.value = true
    } else {
      maybeShowTapIntro()
    }
  }

  function onUsernameSubmit() {
    if (usernameRetry.value) {
      usernameRetry.value = null
      // Nom choisi (ou appareil lié) : les runs gardées repartent.
      retryOnlineQueues()
      return
    }
    markUsernamePrompted()
    showUsernameDialog.value = false
    maybeShowTapIntro()
  }

  return { showUsernameDialog, usernameRetry, onUsernameSubmit, promptAtBoot }
}
