<script setup>
import { ref, computed } from 'vue'
import { MENU_PIXELS, MINE_PIXELS, HEART_PIXELS, ROBOT_PIXELS, HELP_PIXELS } from '../icons'
import { loadTopRuns } from '../runHistory'
import { theme, tapAction, longPressMs, MIN_LONG_PRESS_MS, MAX_LONG_PRESS_MS, showHelpButton, showCoordinates } from '../settings'
import { hasFoundHeart, hasFoundRobot } from '../discoveries'
import { ACHIEVEMENTS, unlockedAchievements } from '../achievements'
import ConfirmDialog from './ConfirmDialog.vue'

defineProps({
  infiniteUnlocked: Boolean
})

const emit = defineEmits(['start-infinite-with-seed', 'reset-everything'])

const isOpen = ref(false)
const activePage = ref(null)
const topRuns = ref([])
const seedInput = ref('')

const isValidSeed = computed(() => seedInput.value !== '' && Number.isFinite(Number(seedInput.value)))

// Pilote le remplissage façon "jauge" du slider 8-bit (cf. .settings-slider)
// — un <input type="range"> ne peut pas lire sa propre position en CSS pur,
// donc ce calcul vit côté JS et est poussé en custom property inline.
const longPressFillPercent = computed(
  () => ((longPressMs.value - MIN_LONG_PRESS_MS) / (MAX_LONG_PRESS_MS - MIN_LONG_PRESS_MS)) * 100
)

// Tri du top des runs (roadmap point 19) : purement un tri d'affichage, ne
// touche jamais à runHistory.js (les runs restent stockées/limitées à 10
// par ordre revealedCount décroissant, cf. recordRun) — sortedRuns en
// dérive une copie triée selon le critère choisi par le joueur.
const SORT_CRITERIA = [
  { key: 'revealedCount', label: 'Cells' },
  { key: 'distance', label: 'Distance' },
  { key: 'minesTriggeredCount', label: 'Mines' },
  { key: 'heartsCollectedCount', label: 'Hearts', requires: hasFoundHeart },
  { key: 'robotsTriggeredCount', label: 'Robots', requires: hasFoundRobot }
]

// Trier par cœurs/robots n'a aucun intérêt tant que le joueur n'en a jamais
// croisé (tout à 0) — masque le chip plutôt que de l'afficher inutilement.
const visibleSortCriteria = computed(() =>
  SORT_CRITERIA.filter((criterion) => !criterion.requires || criterion.requires.value)
)

const sortKey = ref('revealedCount')
const sortDir = ref('desc')

function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

// ?? 0 : les runs enregistrées avant l'ajout des cœurs/robots (roadmap point
// 9) n'ont pas ces champs — les traiter comme 0 plutôt que undefined, sinon
// la soustraction du comparateur produit NaN et casse le tri.
const sortedRuns = computed(() => {
  const factor = sortDir.value === 'desc' ? -1 : 1
  return [...topRuns.value].sort((a, b) => factor * ((a[sortKey.value] ?? 0) - (b[sortKey.value] ?? 0)))
})

function toggleMenu() {
  isOpen.value = !isOpen.value

  if (isOpen.value) {
    topRuns.value = loadTopRuns()
  } else {
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

const showResetConfirm = ref(false)

function confirmReset() {
  showResetConfirm.value = false
  emit('reset-everything')
}

function formatDate(timestamp) {
  const date = new Date(timestamp)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function submitSeed() {
  if (!isValidSeed.value) {
    return
  }

  emit('start-infinite-with-seed', Number(seedInput.value))
  seedInput.value = ''
  closeMenu()
}
</script>

<template>
  <button class="menu-btn" @click="toggleMenu" aria-label="Menu">
    <svg viewBox="0 0 9 9" class="menu-icon" shape-rendering="crispEdges">
      <rect v-for="(p, i) in MENU_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
    </svg>
  </button>

  <div v-if="isOpen" class="menu-overlay" @click.self="closeMenu">
    <div class="menu-panel">
      <button v-if="activePage" class="menu-back pixel-btn" @click="backToMenu" aria-label="Back">&lt;</button>
      <button class="menu-close pixel-btn" @click="closeMenu" aria-label="Close">X</button>

      <template v-if="!activePage">
        <div class="menu-section-title">MENU</div>
        <ul class="nav-list">
          <li><button class="nav-item" @click="openPage('best-runs')">BEST RUNS</button></li>
          <li><button class="nav-item" @click="openPage('achievements')">ACHIEVEMENTS</button></li>
          <li><button class="nav-item" @click="openPage('settings')">SETTINGS</button></li>
          <li><button class="nav-item" @click="openPage('about')">ABOUT</button></li>
        </ul>
      </template>

      <template v-else-if="activePage === 'best-runs'">
        <div class="menu-section-title">TOP RUNS</div>
        <template v-if="topRuns.length">
          <div class="sort-chips">
            <button
              v-for="criterion in visibleSortCriteria"
              :key="criterion.key"
              class="sort-chip"
              :class="{ active: sortKey === criterion.key }"
              @click="setSort(criterion.key)"
            >
              {{ criterion.label }}
              <span v-if="sortKey === criterion.key" class="sort-arrow">{{ sortDir === 'desc' ? '▼' : '▲' }}</span>
            </button>
          </div>
          <ol class="run-list">
            <li v-for="(run, i) in sortedRuns" :key="run.timestamp" class="run-row">
              <div class="run-main">
                <span class="run-rank">#{{ i + 1 }}</span>
                <!-- CELLS/distance restent en texte : pas d'icône naturelle
                     pour ces deux-là (l'anneau d'origine réutilisé pour
                     distance prêtait à confusion avec le repère d'origine
                     du plateau). -->
                <span>{{ run.revealedCount }} cells</span>
                <span>{{ run.distance }} distance</span>
                <span class="run-stat">
                  <svg viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
                    <rect v-for="(p, i) in MINE_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
                  </svg>
                  {{ run.minesTriggeredCount }}
                </span>
                <span v-if="run.heartsCollectedCount" class="run-stat">
                  <svg viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
                    <rect v-for="(p, i) in HEART_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
                  </svg>
                  {{ run.heartsCollectedCount }}
                </span>
                <span v-if="run.robotsTriggeredCount" class="run-stat">
                  <svg viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
                    <rect v-for="(p, i) in ROBOT_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
                  </svg>
                  {{ run.robotsTriggeredCount }}
                </span>
              </div>
              <div class="run-meta">{{ formatDate(run.timestamp) }} &middot; seed {{ run.seed }}</div>
            </li>
          </ol>
        </template>
        <div v-else class="run-empty">No runs yet</div>

        <div class="menu-section-title">PLAY A SEED</div>
        <form class="seed-form" @submit.prevent="submitSeed">
          <label class="seed-label">
            Start infinite game with seed:
            <input
              v-model="seedInput"
              type="number"
              class="seed-input"
              :disabled="!infiniteUnlocked"
              placeholder="e.g. 172837465"
            />
          </label>
          <button type="submit" class="pixel-btn" :disabled="!infiniteUnlocked || !isValidSeed">Start</button>
        </form>
      </template>

      <template v-else-if="activePage === 'achievements'">
        <div class="menu-section-title">ACHIEVEMENTS</div>
        <ul class="achievement-list">
          <li v-for="achievement in ACHIEVEMENTS" :key="achievement.id" class="achievement-row">
            <svg
              v-if="unlockedAchievements[achievement.id]"
              :viewBox="`0 0 ${achievement.pixels.width} ${achievement.pixels.height}`"
              class="achievement-icon"
              shape-rendering="crispEdges"
            >
              <rect
                v-for="(p, i) in achievement.pixels"
                :key="i"
                :x="p.x"
                :y="p.y"
                width="1"
                height="1"
                :fill="p.color"
              />
            </svg>
            <!-- Non débloquée : icône aussi cachée (pas juste le texte), un
                 "?" générique plutôt qu'un teaser de l'asset réel. -->
            <div v-else class="achievement-icon achievement-icon-locked">?</div>
            <div class="achievement-text">
              <div class="achievement-title">
                {{ unlockedAchievements[achievement.id] ? achievement.title : '???' }}
              </div>
              <template v-if="unlockedAchievements[achievement.id]">
                <div class="achievement-description">{{ achievement.description }}</div>
                <div class="achievement-date">{{ formatDate(unlockedAchievements[achievement.id]) }}</div>
              </template>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="activePage === 'settings'">
        <div class="menu-section-title">SETTINGS</div>

        <div class="settings-group">
          <div class="settings-label">Tap / left click:</div>
          <label class="settings-option">
            <input type="radio" name="tap-action" value="reveal" v-model="tapAction" />
            Reveal
          </label>
          <label class="settings-option">
            <input type="radio" name="tap-action" value="flag" v-model="tapAction" />
            Flag
          </label>
          <div class="settings-hint">Long-press does the opposite action</div>
        </div>

        <div class="settings-group">
          <div class="settings-label">Long-press duration: {{ longPressMs }}ms</div>
          <input
            type="range"
            class="settings-slider"
            :min="MIN_LONG_PRESS_MS"
            :max="MAX_LONG_PRESS_MS"
            step="50"
            v-model.number="longPressMs"
            :style="{ '--slider-fill': longPressFillPercent + '%' }"
          />
        </div>

        <div class="settings-group">
          <div class="settings-label">Style:</div>
          <label class="settings-option">
            <input type="radio" name="theme" value="light" v-model="theme" />
            Light
          </label>
          <label class="settings-option">
            <input type="radio" name="theme" value="dark" v-model="theme" />
            Dark
          </label>
        </div>

        <!-- N'a de sens que si le joueur a déjà croisé au moins une case
             spéciale — sinon les boutons "?" eux-mêmes ne sont visibles
             nulle part (gated sur les compteurs > 0 dans App.vue), donc ce
             réglage n'aurait rien à montrer/masquer. hasFoundHeart/Robot
             (discoveries.js) plutôt que les compteurs de la partie en cours
             : un jalon qui survit d'une partie à l'autre, pas juste "cette
             run précise a déjà eu un cœur". -->
        <div v-if="hasFoundHeart || hasFoundRobot" class="settings-group">
          <div class="settings-label">Help:</div>
          <label class="settings-checkbox">
            <input type="checkbox" v-model="showHelpButton" />
            Show
            <svg viewBox="0 0 9 9" class="settings-checkbox-icon" shape-rendering="crispEdges">
              <rect v-for="(p, i) in HELP_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
            </svg>
            buttons
          </label>
        </div>

        <!-- Le repère POS ne s'affiche qu'en mode infini (footer) — inutile
             de proposer le réglage tant que ce mode n'est pas débloqué,
             même logique que le gate hasFoundHeart/Robot ci-dessus. -->
        <div v-if="infiniteUnlocked" class="settings-group">
          <div class="settings-label">Infinite:</div>
          <label class="settings-checkbox">
            <input type="checkbox" v-model="showCoordinates" />
            Show position (x,y)
          </label>
        </div>

        <div class="settings-group">
          <div class="settings-label">Danger zone:</div>
          <button class="pixel-btn" @click="showResetConfirm = true">Reset everything</button>
          <div class="settings-hint">Erases all progress, settings and run history</div>
        </div>
      </template>

      <template v-else-if="activePage === 'about'">
        <div class="menu-section-title">ABOUT</div>
        <div class="about-content">
          <div class="about-name">Hibol Minesweeper</div>
          <a class="about-link pixel-btn" href="mailto:hibol18@gmail.com?subject=Hibol%20Minesweeper%20feedback">Send feedback</a>
        </div>
      </template>
    </div>
  </div>

  <ConfirmDialog
    :show="showResetConfirm"
    title="RESET EVERYTHING?"
    message="All progress, settings and run history will be erased."
    confirm-label="Reset"
    @cancel="showResetConfirm = false"
    @confirm="confirmReset"
  />
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
  font-family: 'VT323', monospace;
  text-align: center;
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
  font-family: 'VT323', monospace;
  font-size: 17px;
  letter-spacing: 1px;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  padding: 10px 14px;
  color: var(--color-text-strong);
  cursor: pointer;
}

.about-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.about-name {
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: var(--color-text-strong);
}

.about-link {
  text-decoration: none;
  display: inline-block;
}

.menu-section-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: var(--color-text-strong);
  margin: 24px 0 14px;
}

.menu-section-title:first-child {
  margin-top: 4px;
}

/* Rangée de "chips" plutôt que de vraies entêtes de colonnes : .run-main
   n'est pas un tableau (flex centré qui wrap item par item, cf. commentaire
   plus bas sur .run-main) — pas de colonnes fixes à faire correspondre à des
   entêtes. Bordure sans box-shadow (contrairement à .pixel-btn) pour rester
   visuellement plus léger qu'un vrai bouton d'action comme "Start"/"Reset". */
.sort-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-bottom: 10px;
}

.sort-chip {
  font-family: 'VT323', monospace;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  padding: 3px 8px;
  color: var(--color-text);
  cursor: pointer;
}

.sort-chip.active {
  background: var(--color-chrome-border);
  color: var(--color-panel-bg);
}

.sort-arrow {
  font-size: 11px;
}

.run-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.run-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--color-cell-revealed-border);
}

.run-row:last-child {
  border-bottom: none;
}

.run-main {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 14px;
  color: var(--color-text);
}

.run-rank {
  color: var(--color-text-strong);
  font-weight: bold;
}

.run-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.run-icon {
  width: 14px;
  height: 14px;
}

.run-meta {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.7;
}

.run-empty {
  font-size: 14px;
  color: var(--color-text);
  opacity: 0.7;
}

.achievement-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
}

.achievement-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-cell-revealed-border);
}

.achievement-row:last-child {
  border-bottom: none;
}

.achievement-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}

/* Générique (un "?" à la place de l'asset réel), pas un teaser de l'icône —
   même esprit que le titre "???" juste à côté. */
.achievement-icon-locked {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Press Start 2P', monospace;
  font-size: 14px;
  color: var(--color-text);
  opacity: 0.4;
  border: 2px dashed var(--color-cell-revealed-border);
}

.achievement-title {
  font-size: 15px;
  color: var(--color-text-strong);
  font-weight: bold;
}

.achievement-description {
  margin-top: 2px;
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.3;
}

/* Même traitement que .run-meta (dates des Best Runs) : petit, atténué. */
.achievement-date {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.7;
}

.seed-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.seed-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  color: var(--color-text);
}

.seed-input {
  font-family: 'VT323', monospace;
  font-size: 15px;
  width: 160px;
  padding: 4px 8px;
  background: var(--color-cell-unrevealed-bg);
  border: 2px solid var(--color-chrome-border);
  color: var(--color-text-strong);
  text-align: center;
}

.seed-input:disabled {
  opacity: 0.5;
}

.settings-group {
  margin-bottom: 18px;
}

.settings-label {
  font-size: 15px;
  color: var(--color-text);
  margin-bottom: 8px;
}

.settings-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text);
  opacity: 0.7;
}

.settings-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 10px;
  font-size: 15px;
  color: var(--color-text-strong);
  cursor: pointer;
}

.settings-option input[type="radio"] {
  appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 2px solid var(--color-chrome-border);
  background: var(--color-panel-bg);
  cursor: pointer;
}

.settings-option input[type="radio"]:checked {
  background: var(--color-chrome-border);
}

/* Case à cocher plutôt qu'une paire de radios : showHelpButton est un
   simple on/off, pas un choix entre options mutuellement exclusives — même
   traitement visuel (carré, pas de coche native) que .settings-option
   input[type=radio] ci-dessus, juste sans le fill rond au centre. */
.settings-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: var(--color-text-strong);
  cursor: pointer;
}

.settings-checkbox input[type="checkbox"] {
  appearance: none;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 2px solid var(--color-chrome-border);
  background: var(--color-panel-bg);
  cursor: pointer;
}

.settings-checkbox-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.settings-checkbox input[type="checkbox"]:checked {
  background: var(--color-chrome-border);
}

/* input[type=range] ne se restyle pas via une seule règle cross-navigateur
   (Chrome/Firefox exposent chaque partie via des pseudo-éléments préfixés
   différents, pas de spec commune) — d'où les blocs webkit et moz séparés
   ci-dessous plutôt qu'une seule .settings-slider { ... }. Le
   remplissage façon jauge (--slider-fill, pilotée depuis le script,
   cf. longPressFillPercent) reprend le même principe que .danger-bar-fill
   dans App.vue : un dégradé net (pas de flou) coupé à un pourcentage exact,
   pas un vrai gradient visuel. */
/* Bordure/hauteur/fond alignés sur .danger-bar dans App.vue (1px, même
   variable de couleur) plutôt que la bordure 2px chrome-border d'origine —
   trop épaisse à côté d'une vraie barre du jeu, ça ne lisait plus comme la
   même famille de composant. */
.settings-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 12px;
  margin: 6px 0;
  border: 1px solid var(--color-danger-bar-border);
  background: linear-gradient(
    to right,
    var(--color-danger-fill) var(--slider-fill),
    var(--color-danger-bar-bg) var(--slider-fill)
  );
  cursor: pointer;
}

.settings-slider::-webkit-slider-runnable-track {
  -webkit-appearance: none;
  background: transparent;
}

.settings-slider::-moz-range-track {
  background: transparent;
  border: none;
}

/* Bloc plein carré (pas de border-radius) plutôt qu'un rond natif, même
   logique que les cases à cocher radio juste au-dessus : un aplat de
   couleur net, pas de dégradé/ombre douce. Décalage vertical -4px = (hauteur
   piste 12px - hauteur thumb 20px) / 2, pour centrer le bloc sur la piste
   (Chrome ne le fait pas tout seul une fois -webkit-appearance retiré,
   contrairement à Firefox qui centre ::-moz-range-thumb automatiquement). */
.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 20px;
  margin-top: -4px;
  background: var(--color-chrome-border);
  border: 2px solid var(--color-border-soft);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  cursor: pointer;
}

.settings-slider::-moz-range-thumb {
  width: 12px;
  height: 20px;
  border-radius: 0;
  background: var(--color-chrome-border);
  border: 2px solid var(--color-border-soft);
  box-shadow: 2px 2px 0 var(--color-border-soft);
  cursor: pointer;
}
</style>
