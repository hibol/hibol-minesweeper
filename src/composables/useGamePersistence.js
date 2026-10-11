import { onScopeDispose } from "vue"
import { saveActiveGame } from "../state/gameStorage"
import { STORAGE_PREFIX, clearGameStorage } from "../state/storageReset"
import {
  captureIdentityMergesForImport,
  queueIdentityMergesAfterImport,
} from "../state/pendingIdentityMerges"

// Sauvegarde de la partie en cours quand la page devient invisible (mobile :
// un onglet en arrière-plan est souvent tué), plus reset et import de
// sauvegarde, qui doivent couper cette sauvegarde avant de recharger.
// attachListeners() est appelé par App.vue une fois la partie de démarrage
// en place ; le détachement est automatique à la fin du scope.
export function useGamePersistence(
  game,
  {
    originX,
    originY,
    cellSize,
    suspendLegacy,
    legacySnapshotExtras,
    resumeLegacyIfPlaying,
    treasurePause,
    treasureResume,
    persistTreasureGame,
    retryOnlineQueues,
  },
) {
  // Point commun à « changer de mode », « onglet masqué » et « pagehide » :
  // c'est aussi là que les chronos Trésor et Legacy se mettent en pause.
  function persistActiveGame() {
    // La chasse a sa propre persistance (par jour), pas le slot par mode.
    if (game.value.mode === "treasure") {
      treasurePause()
      persistTreasureGame()
      return
    }

    // Legacy : temps écoulé et journal de coups glissés dans le snapshot.
    const legacy = game.value.mode === "legacy"
    if (legacy) {
      suspendLegacy()
    }

    saveActiveGame(
      game.value,
      {
        originX: originX.value,
        originY: originY.value,
        cellSize: cellSize.value,
      },
      legacy ? legacySnapshotExtras() : undefined,
    )
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      persistActiveGame()
    } else {
      treasureResume()
      resumeLegacyIfPlaying()
    }
  }

  // pagehide en renfort : visibilitychange n'est pas fiable sur tous les
  // navigateurs mobiles. online : renvois en attente dès le retour du réseau.
  function attachListeners() {
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pagehide", persistActiveGame)
    window.addEventListener("online", retryOnlineQueues)
  }

  // location.reload() déclenche pagehide : sans ce détachement, la partie
  // en cours se réécrirait juste après le reset ou l'import.
  function detachPersistenceListeners() {
    document.removeEventListener("visibilitychange", onVisibilityChange)
    window.removeEventListener("pagehide", persistActiveGame)
  }

  onScopeDispose(() => {
    detachPersistenceListeners()
    window.removeEventListener("online", retryOnlineQueues)
  })

  // keepOnlineAccount : choix du joueur dans la confirmation (SettingsPage).
  function resetEverything({ keepOnlineAccount }) {
    detachPersistenceListeners()
    clearGameStorage({ keepOnlineAccount })
    location.reload()
  }

  // data : { clé -> valeur }, déjà vérifié par SettingsPage. Remplace le
  // stockage (pas de fusion), en re-filtrant sur le préfixe par prudence.
  function onImportSave(data) {
    detachPersistenceListeners()
    // L'identité en ligne de cet appareil rejoindra celle du fichier.
    const identityMerges = captureIdentityMergesForImport(data)
    clearGameStorage()

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.setItem(key, value)
      }
    }

    queueIdentityMergesAfterImport(identityMerges)
    location.reload()
  }

  return {
    persistActiveGame,
    attachListeners,
    detachPersistenceListeners,
    resetEverything,
    onImportSave,
  }
}
