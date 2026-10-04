<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue"
import { MENU_PIXELS } from "../icons"
import { username } from "../state/username"
import { hasAnyLegacyScore } from "../state/legacyScores"
import InfiniteRunsPage from "./menu/InfiniteRunsPage.vue"
import LegacyTimesPage from "./menu/LegacyTimesPage.vue"
import HuntLogPage from "./menu/HuntLogPage.vue"
import AchievementsPage from "./menu/AchievementsPage.vue"
import ShopPage from "./menu/ShopPage.vue"
import SettingsPage from "./menu/SettingsPage.vue"
import AboutPage from "./menu/AboutPage.vue"
// Styles communs aux pages (globaux : un style scoped ne descend pas dans
// les composants enfants).
import "./menu/menu.css"

defineProps({
  infiniteUnlocked: Boolean,
})

const emit = defineEmits([
  "start-infinite-with-seed",
  "reset-everything",
  "import-save",
])

// v-model:open côté App.vue (qui doit savoir si le menu est ouvert, cf. la
// cible du niveau carte) ; reste un état local si le parent ne le lie pas.
const isOpen = defineModel("open", { type: Boolean, default: false })
// Page affichée (null = liste de navigation). Chaque page est un composant
// recréé à chaque ouverture : son état (onglet, tri, classements chargés)
// repart de zéro.
const activePage = ref(null)

// Lié par v-model:open, isOpen ne prend la nouvelle valeur qu'au rendu suivant
// (le parent la renvoie en prop) : on décide sur `opening`, pas en relisant.
function toggleMenu() {
  const opening = !isOpen.value
  isOpen.value = opening

  if (!opening) {
    activePage.value = null
  }
}

function closeMenu() {
  isOpen.value = false
  activePage.value = null
}

function openPage(page) {
  activePage.value = page
}

function backToMenu() {
  activePage.value = null
}

// Échap (et le bouton retour Android, qui le simule) remonte d'un niveau :
// page → menu → fermé. Écouté sur window, pas document : un ConfirmDialog
// ouvert par-dessus écoute document, passe donc avant et marque l'événement.
function onEscape(e) {
  if (e.key !== "Escape" || e.defaultPrevented) return
  e.preventDefault()
  if (activePage.value) backToMenu()
  else closeMenu()
}

watch(isOpen, (open) => {
  if (open) window.addEventListener("keydown", onEscape)
  else window.removeEventListener("keydown", onEscape)
})
onBeforeUnmount(() => window.removeEventListener("keydown", onEscape))

const legacyTimesVisible = computed(() => hasAnyLegacyScore())

// PLAY A SEED lance une partie : le menu se ferme pour la montrer.
function onStartInfiniteWithSeed(seed) {
  emit("start-infinite-with-seed", seed)
  closeMenu()
}
</script>

<template>
  <button class="menu-btn" aria-label="Menu" @click="toggleMenu">
    <svg viewBox="0 0 9 9" class="menu-icon" shape-rendering="crispEdges">
      <rect
        v-for="(p, i) in MENU_PIXELS"
        :key="i"
        :x="p.x"
        :y="p.y"
        width="1"
        height="1"
        :fill="p.color"
      />
    </svg>
  </button>

  <div v-if="isOpen" class="menu-overlay" @click.self="closeMenu">
    <div class="menu-panel">
      <button
        v-if="activePage"
        class="menu-back pixel-btn"
        aria-label="Back"
        @click="backToMenu"
      >
        &lt;
      </button>
      <button
        class="menu-close pixel-btn"
        aria-label="Close"
        @click="closeMenu"
      >
        X
      </button>

      <template v-if="!activePage">
        <div class="menu-section-title">MENU</div>
        <!-- Pseudo choisi au premier lancement (username.js) — affiché seulement
             s'il est renseigné, non éditable ici (par choix). -->
        <div v-if="username" class="menu-username">
          <span class="menu-username-label">PLAYER</span>
          {{ username }}
        </div>
        <ul class="nav-list">
          <li>
            <button class="nav-item" @click="openPage('infinite-runs')">
              INFINITE RUNS
            </button>
          </li>
          <li v-if="legacyTimesVisible">
            <button class="nav-item" @click="openPage('legacy-times')">
              LEGACY TIMES
            </button>
          </li>
          <li v-if="infiniteUnlocked">
            <button class="nav-item" @click="openPage('hunt-log')">
              HUNT LOG
            </button>
          </li>
          <li>
            <button class="nav-item" @click="openPage('achievements')">
              ACHIEVEMENTS
            </button>
          </li>
          <li v-if="infiniteUnlocked">
            <button class="nav-item" @click="openPage('shop')">SHOP</button>
          </li>
          <li>
            <button class="nav-item" @click="openPage('settings')">
              SETTINGS
            </button>
          </li>
          <li>
            <button class="nav-item" @click="openPage('about')">ABOUT</button>
          </li>
        </ul>
      </template>

      <InfiniteRunsPage
        v-else-if="activePage === 'infinite-runs'"
        :infinite-unlocked="infiniteUnlocked"
        @start-infinite-with-seed="onStartInfiniteWithSeed"
      />
      <LegacyTimesPage v-else-if="activePage === 'legacy-times'" />
      <HuntLogPage v-else-if="activePage === 'hunt-log'" />
      <AchievementsPage v-else-if="activePage === 'achievements'" />
      <ShopPage v-else-if="activePage === 'shop'" />
      <!-- Reset et import rechargent la page : c'est App.vue qui le fait,
           après avoir retiré ses listeners de persistance. -->
      <SettingsPage
        v-else-if="activePage === 'settings'"
        :infinite-unlocked="infiniteUnlocked"
        @reset-everything="emit('reset-everything', $event)"
        @import-save="emit('import-save', $event)"
      />
      <AboutPage v-else-if="activePage === 'about'" />
    </div>
  </div>
</template>

<style scoped>
.menu-btn {
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  padding: 6px;
  cursor: pointer;
  display: flex;
}

.menu-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Bord à bord (APK, PWA) : la boîte centrée évite les barres système. */
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
    env(safe-area-inset-bottom) env(safe-area-inset-left);
}

.menu-panel {
  position: relative;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 24px 32px;
  min-width: 280px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  font-family: "VT323", monospace;
  text-align: center;
  /* Colonne flex : les listes longues (INFINITE RUNS, HUNT LOG, ACHIEVEMENTS,
     SHOP) défilent DANS leur propre cadre plutôt que de faire défiler tout
     le popup — le titre de section, les chips de tri et "PLAY A SEED"
     restent visibles. L'overflow-y ci-dessus reste un filet de sécurité si
     une page sans liste dédiée (SETTINGS) dépasse 80vh. */
  display: flex;
  flex-direction: column;
}

/* Chaque enfant direct est figé... */
.menu-panel > * {
  flex-shrink: 0;
}

/* ...sauf la page, qui rétrécit pour laisser sa liste défiler (cf. menu.css).
   La racine d'un composant enfant porte aussi l'attribut scoped du parent :
   cette règle l'atteint, et l'emporte sur la précédente (plus spécifique). */
.menu-panel > .menu-page {
  flex-shrink: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.menu-close {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 8px;
  line-height: 1;
}

.menu-back {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 2px 8px;
  line-height: 1;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 200px;
}

.nav-item {
  width: 100%;
  font-family: "VT323", monospace;
  font-size: 17px;
  letter-spacing: 1px;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  padding: 10px 14px;
  color: var(--color-text-strong);
  cursor: pointer;
}

.menu-username {
  margin-bottom: 16px;
  font-size: 17px;
  color: var(--color-text-strong);
  word-break: break-word;
}

.menu-username-label {
  display: block;
  margin-bottom: 2px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--color-text);
  opacity: 0.6;
}
</style>
