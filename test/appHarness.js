import { beforeEach, afterEach, vi } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import App from "../src/App.vue"
import { inventory } from "../src/state/shop"
import { treasureEntries } from "../src/state/treasureLog"
import { hibolBalance } from "../src/state/treasureHunt"

// Socle des tests d'intégration d'App.vue (src/App.*.integration.test.js) :
// montage de l'App entière, clés de stockage utiles et remise à zéro entre
// deux tests. `game` et `legacyMoveLog` sont lisibles via defineExpose.

export const K = {
  infiniteUnlocked: "hibol-minesweeper:infinite-unlocked",
  lastMode: "hibol-minesweeper:last-mode",
  classicSlot: "hibol-minesweeper:active-game:classic",
  infiniteSlot: "hibol-minesweeper:active-game:infinite",
}

// Liaison vivante : les fichiers qui l'importent voient la valeur courante
// (réaffectée à chaque mountApp), pas celle du chargement.
export let wrapper = null

// À appeler une fois en haut de chaque fichier de test : pose les hooks.
export function useAppHarness() {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    // legacyUnlocked (shop.js) est un singleton de module, pas réinitialisé par
    // localStorage.clear() — évite de fuiter vers d'autres tests du fichier.
    delete inventory.value.legacyMode
    // treasureEntries (treasureLog.js) : même singleton de module, même raison.
    treasureEntries.value = []
    // hibolBalance (treasureHunt.js) : idem — assignation directe en nettoyage
    // de test seulement, jamais en dehors (cf. addHibols/spendHibols).
    hibolBalance.value = 0
    // fetch stubbé par certains tests (Give Up, Legacy) : jamais laissé fuiter.
    vi.unstubAllGlobals()
  })
}

export async function mountApp() {
  wrapper = mount(App)
  await flushPromises()
  return wrapper
}

export const modeButton = (label) =>
  wrapper.findAll(".mode-btn").find((b) => b.text().includes(label))
