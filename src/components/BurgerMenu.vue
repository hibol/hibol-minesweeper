<script setup>
import { ref, computed, watch } from 'vue'
import {
  MENU_PIXELS, MINE_PIXELS, HEART_PIXELS, ROBOT_PIXELS, HELP_PIXELS, CHEST_PIXELS,
  HIBOL_PIXELS, WIND_MACHINE_PIXELS, TRAVEL_MACHINE_PIXELS, XRAY_MACHINE_PIXELS, SMILEY_PIXELS
} from '../icons'
import { loadTopRuns } from '../runHistory'
import { theme, tapAction, longPressMs, MIN_LONG_PRESS_MS, MAX_LONG_PRESS_MS, showHelpButton, showCoordinates } from '../settings'
import { hasFoundHeart, hasFoundRobot } from '../discoveries'
import { ACHIEVEMENTS, unlockedAchievements } from '../achievements'
import { username } from '../username'
import { chestReward, treasureDayKey } from '../treasureHunt'
import { SHOP_ITEMS, inventory, buy, legacyUnlocked } from '../shop'
import {
  MINE_SKINS, FLAG_SKINS,
  equippedMineSkin, equippedFlagSkin,
  equipMineSkin, equipFlagSkin, skinOwned
} from '../cosmetics'
import { treasureEntries, currentStreak, bestStreak } from '../treasureLog'
import { legacyScores, hasAnyLegacyScore, LEGACY_SCORE_DIFFICULTIES } from '../legacyScores'
import { buildExport, verifyAndParse } from '../saveTransfer'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  infiniteUnlocked: Boolean,
  // Le mode Legacy est encore derrière le bouton DEV : la page LEGACY TIMES
  // apparaît si DEV est actif OU si au moins un temps a déjà été enregistré.
  // (Phase 3 : gate propre sur la possession du mode.)
  devUnlocked: Boolean
})

// Catalogue id -> sprite. Kept here rather than in shop.js so the data module
// stays free of icon imports (same split as the rest: icons.js is the only
// place that knows about pixel grids).
const SHOP_ICONS = {
  windMachine: WIND_MACHINE_PIXELS,
  travelMachine: TRAVEL_MACHINE_PIXELS,
  xrayMachine: XRAY_MACHINE_PIXELS,
  legacyMode: SMILEY_PIXELS
}

// Chips de la page SHOP : une catégorie visible à la fois. `machine` par
// défaut (la seule non vide avec `mode`).
const SHOP_CATEGORIES = [
  { key: 'machine', label: 'Machines' },
  { key: 'cosmetic', label: 'Customisation' },
  { key: 'mode', label: 'Modes' }
]
const shopCategory = ref('machine')
const shopCategoryItems = computed(() => SHOP_ITEMS.filter((item) => item.category === shopCategory.value))

// Page Customisation : deux slots, chacun sa liste de skins (défaut + achetés).
const SKIN_SLOTS = [
  { slot: 'mine', title: 'Mines', skins: MINE_SKINS },
  { slot: 'flag', title: 'Flags', skins: FLAG_SKINS }
]

function isEquipped(slot, id) {
  return (slot === 'mine' ? equippedMineSkin : equippedFlagSkin).value === id
}

function equipSkin(slot, id) {
  ;(slot === 'mine' ? equipMineSkin : equipFlagSkin)(id)
}

// Achat d'un skin : dépense les hibols puis l'équipe d'office.
function buySkin(slot, skin) {
  if (buy(skin.shopId)) {
    equipSkin(slot, skin.id)
  }
}

const emit = defineEmits(['start-infinite-with-seed', 'reset-everything', 'import-save'])

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

// Les achievements marqués `gate: 'legacy'` (Pro / Ultra Pro / Noob, rattachés
// au mode Legacy) sont masqués tant que le mode n'est pas acheté. Ils sont en
// fin de `ACHIEVEMENTS`, donc apparaissent en bas de liste une fois débloqués.
const visibleAchievements = computed(() =>
  ACHIEVEMENTS.filter((a) => !a.gate || (a.gate === 'legacy' && legacyUnlocked.value))
)

// Indice d'un achievement encore verrouillé, révélé au tap sur sa ligne (page
// ACHIEVEMENTS) — un seul ouvert à la fois, retapper referme. Remis à zéro dès
// qu'on change de page pour ne pas rouvrir un indice en revenant plus tard.
const openHintId = ref(null)

function toggleHint(id) {
  openHintId.value = openHintId.value === id ? null : id
}

watch(activePage, (page) => {
  openHintId.value = null

  // À l'ouverture de LEGACY TIMES, se cale sur la 1re difficulté qui a des
  // temps (évite un "No times yet" trompeur si on n'a joué que l'Expert).
  if (page === 'legacy-times') {
    const withScores = LEGACY_SCORE_DIFFICULTIES.find(
      (difficulty) => (legacyScores.value[difficulty] ?? []).length > 0
    )
    if (withScores) {
      legacyTimesDifficulty.value = withScores
    }
  }
})

const showResetConfirm = ref(false)

function confirmReset() {
  showResetConfirm.value = false
  emit('reset-everything')
}

// --- Backup (Settings) : export d'un fichier JSON signé, import qui vérifie
// la signature avant de remplacer la sauvegarde (l'écriture + reload se font
// dans App.vue, cf. resetEverything, pour la même raison de teardown des
// listeners de persistance).
const importFileInput = ref(null)
const showImportConfirm = ref(false)
const pendingImportData = ref(null)
// Feedback inline (un toast s'afficherait derrière l'overlay du menu).
const backupError = ref('')

async function exportSave() {
  backupError.value = ''

  try {
    const payload = await buildExport()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hibol-minesweeper-save-${treasureDayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    backupError.value = 'Export failed'
  }
}

function pickImportFile() {
  backupError.value = ''
  importFileInput.value?.click()
}

async function onImportFilePicked(event) {
  const file = event.target.files?.[0]
  // Vider tout de suite pour que re-choisir le MÊME fichier redéclenche change.
  event.target.value = ''

  if (!file) {
    return
  }

  const result = await verifyAndParse(await file.text())

  if (!result.ok) {
    backupError.value = `Import failed — ${result.error}`
    return
  }

  pendingImportData.value = result.data
  showImportConfirm.value = true
}

function confirmImport() {
  showImportConfirm.value = false
  emit('import-save', pendingImportData.value)
  pendingImportData.value = null
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

const treasuresFound = computed(() => treasureEntries.value.filter((e) => e.outcome === 'won').length)
const treasureWinRate = computed(() =>
  treasureEntries.value.length ? Math.round((treasuresFound.value / treasureEntries.value.length) * 100) : 0
)

function formatDayKey(dayKey) {
  return `${dayKey.slice(0, 4)}-${dayKey.slice(4, 6)}-${dayKey.slice(6, 8)}`
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// --- LEGACY TIMES ---------------------------------------------------------
const legacyTimesVisible = computed(() => props.devUnlocked || hasAnyLegacyScore())

const LEGACY_DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert'
}

const legacyTimesDifficulty = ref('beginner')
const legacyTimesList = computed(() => legacyScores.value[legacyTimesDifficulty.value] ?? [])
// Le plus grand nombre de scores parmi les 3 difficultés : sert à réserver
// autant de lignes (dont certaines vides) quelle que soit la difficulté
// affichée, pour que le panneau ne saute pas de taille en changeant de chip.
const legacyTimesMaxCount = computed(() =>
  Math.max(...LEGACY_SCORE_DIFFICULTIES.map((d) => (legacyScores.value[d] ?? []).length))
)

function formatScoreDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleDateString() : ''
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
        <!-- Pseudo choisi au premier lancement (username.js) — affiché seulement
             s'il est renseigné, non éditable ici (par choix). -->
        <div v-if="username" class="menu-username">
          <span class="menu-username-label">PLAYER</span>
          {{ username }}
        </div>
        <ul class="nav-list">
          <li><button class="nav-item" @click="openPage('best-runs')">BEST RUNS</button></li>
          <li v-if="legacyTimesVisible"><button class="nav-item" @click="openPage('legacy-times')">LEGACY TIMES</button></li>
          <li v-if="infiniteUnlocked"><button class="nav-item" @click="openPage('hunt-log')">HUNT LOG</button></li>
          <li><button class="nav-item" @click="openPage('achievements')">ACHIEVEMENTS</button></li>
          <li v-if="infiniteUnlocked"><button class="nav-item" @click="openPage('shop')">SHOP</button></li>
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

      <template v-else-if="activePage === 'legacy-times'">
        <div class="menu-section-title">LEGACY TIMES</div>
        <!-- Une difficulté à la fois — chips repris de BEST RUNS. -->
        <div class="sort-chips">
          <button
            v-for="difficulty in LEGACY_SCORE_DIFFICULTIES"
            :key="difficulty"
            class="sort-chip"
            :class="{ active: legacyTimesDifficulty === difficulty }"
            @click="legacyTimesDifficulty = difficulty"
          >
            {{ LEGACY_DIFFICULTY_LABELS[difficulty] }}
          </button>
        </div>
        <ol v-if="legacyTimesMaxCount" class="run-list">
          <li
            v-for="i in legacyTimesMaxCount"
            :key="legacyTimesList[i - 1] ? legacyTimesList[i - 1].timestamp : `pad-${i}`"
            class="run-row"
            :class="{ 'run-row-pad': !legacyTimesList[i - 1] && !(i === 1 && !legacyTimesList.length) }"
          >
            <template v-if="legacyTimesList[i - 1]">
              <div class="run-main">
                <span class="run-rank">#{{ i }}</span>
                <span class="run-time">{{ formatDuration(legacyTimesList[i - 1].timeMs) }}</span>
                <span v-if="legacyTimesList[i - 1].name">{{ legacyTimesList[i - 1].name }}</span>
              </div>
              <div class="run-meta">{{ formatScoreDate(legacyTimesList[i - 1].timestamp) }}</div>
            </template>
            <template v-else-if="i === 1 && !legacyTimesList.length">
              <div class="run-main">No times yet</div>
              <div class="run-meta">&nbsp;</div>
            </template>
            <template v-else>
              <div class="run-main">&nbsp;</div>
              <div class="run-meta">&nbsp;</div>
            </template>
          </li>
        </ol>
        <div v-else class="run-empty">No times yet</div>
      </template>

      <template v-else-if="activePage === 'hunt-log'">
        <div class="menu-section-title">HUNT LOG</div>
        <div class="hunt-log-header">
          <span>Streak {{ currentStreak }}</span>
          <span>Best {{ bestStreak }}</span>
          <span>Found {{ treasuresFound }}</span>
          <span>Win rate {{ treasureWinRate }}%</span>
        </div>
        <ol v-if="treasureEntries.length" class="run-list">
          <li v-for="entry in treasureEntries" :key="entry.dayKey" class="run-row">
            <div class="run-main">
              <svg v-if="entry.outcome === 'won'" viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
                <rect v-for="(p, i) in CHEST_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
              </svg>
              <svg v-else viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
                <rect v-for="(p, i) in MINE_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
              </svg>
              <span>{{ formatDayKey(entry.dayKey) }}</span>
              <span>{{ entry.minesHit }}/3 mines</span>
              <span>{{ formatDuration(entry.timeMs) }}</span>
              <span v-if="entry.reward" class="run-stat">
                <svg viewBox="0 0 9 9" class="run-icon" shape-rendering="crispEdges">
                  <rect v-for="(p, i) in HIBOL_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
                </svg>
                +{{ entry.reward }}
              </span>
            </div>
          </li>
        </ol>
        <div v-else class="run-empty">No hunts yet</div>
      </template>

      <template v-else-if="activePage === 'achievements'">
        <div class="menu-section-title">ACHIEVEMENTS</div>
        <ul class="achievement-list">
          <!-- Ligne verrouillée : cliquable pour dévoiler l'indice (à la place
               du "???"). role/tabindex/keydown pour que ce soit aussi
               atteignable au clavier, la ligne n'étant pas un vrai <button>. -->
          <li
            v-for="achievement in visibleAchievements"
            :key="achievement.id"
            class="achievement-row"
            :class="{ 'achievement-row-locked': !unlockedAchievements[achievement.id] }"
            :role="unlockedAchievements[achievement.id] ? null : 'button'"
            :tabindex="unlockedAchievements[achievement.id] ? null : 0"
            @click="!unlockedAchievements[achievement.id] && toggleHint(achievement.id)"
            @keydown.enter.prevent="!unlockedAchievements[achievement.id] && toggleHint(achievement.id)"
            @keydown.space.prevent="!unlockedAchievements[achievement.id] && toggleHint(achievement.id)"
          >
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
              <div :class="!unlockedAchievements[achievement.id] && openHintId === achievement.id ? 'achievement-hint' : 'achievement-title'">
                {{ unlockedAchievements[achievement.id]
                  ? achievement.title
                  : (openHintId === achievement.id ? achievement.hint : '???') }}
              </div>
              <template v-if="unlockedAchievements[achievement.id]">
                <div class="achievement-description">{{ achievement.description }}</div>
                <div class="achievement-date">{{ formatDate(unlockedAchievements[achievement.id]) }}</div>
              </template>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="activePage === 'shop'">
        <div class="menu-section-title">SHOP</div>
        <div class="shop-balance">
          <svg viewBox="0 0 9 9" class="hibol-icon" shape-rendering="crispEdges">
            <rect v-for="(p, i) in HIBOL_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
          </svg>
          {{ chestReward }} {{ chestReward === 1 ? 'hibol' : 'hibols' }}
        </div>

        <div class="sort-chips">
          <button
            v-for="cat in SHOP_CATEGORIES"
            :key="cat.key"
            class="sort-chip"
            :class="{ active: shopCategory === cat.key }"
            @click="shopCategory = cat.key"
          >
            {{ cat.label }}
          </button>
        </div>

        <!-- Customisation : skins équipables (défaut + achetés), groupés par
             slot. Un skin possédé s'équipe / se change librement. -->
        <template v-if="shopCategory === 'cosmetic'">
          <template v-for="group in SKIN_SLOTS" :key="group.slot">
            <div class="shop-subhead">{{ group.title }}</div>
            <ul class="shop-list">
              <li v-for="skin in group.skins" :key="skin.id" class="shop-row">
                <svg viewBox="0 0 9 9" class="shop-icon" shape-rendering="crispEdges">
                  <rect v-for="(p, i) in skin.pixels" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
                </svg>
                <div class="shop-text">
                  <div class="shop-name">{{ skin.name }}</div>
                </div>
                <button
                  v-if="!skinOwned(skin)"
                  class="pixel-btn shop-buy"
                  :disabled="chestReward < 3"
                  @click="buySkin(group.slot, skin)"
                >
                  Buy&nbsp;&middot;&nbsp;3
                  <svg viewBox="0 0 9 9" class="hibol-icon-sm" shape-rendering="crispEdges">
                    <rect v-for="(p, i) in HIBOL_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
                  </svg>
                </button>
                <button v-else-if="isEquipped(group.slot, skin.id)" class="pixel-btn shop-buy" disabled>
                  Equipped
                </button>
                <button v-else class="pixel-btn shop-buy" @click="equipSkin(group.slot, skin.id)">
                  Equip
                </button>
              </li>
            </ul>
          </template>
        </template>

        <ul v-else-if="shopCategoryItems.length" class="shop-list">
          <li v-for="item in shopCategoryItems" :key="item.id" class="shop-row">
            <svg viewBox="0 0 9 9" class="shop-icon" shape-rendering="crispEdges">
              <rect
                v-for="(p, i) in SHOP_ICONS[item.id]"
                :key="i"
                :x="p.x"
                :y="p.y"
                width="1"
                height="1"
                :fill="p.color"
              />
            </svg>
            <div class="shop-text">
              <div class="shop-name">
                {{ item.name }}
                <span v-if="item.category === 'machine' && inventory[item.id]" class="shop-owned">x{{ inventory[item.id] }}</span>
              </div>
              <div class="shop-desc">{{ item.desc }}</div>
            </div>
            <!-- Un déblocage de mode déjà acheté n'est plus rachetable. -->
            <button v-if="item.category === 'mode' && inventory[item.id]" class="pixel-btn shop-buy" disabled>
              Owned
            </button>
            <button
              v-else
              class="pixel-btn shop-buy"
              :disabled="chestReward < item.cost"
              @click="buy(item.id)"
            >
              Buy&nbsp;&middot;&nbsp;{{ item.cost }}
              <svg viewBox="0 0 9 9" class="hibol-icon-sm" shape-rendering="crispEdges">
                <rect v-for="(p, i) in HIBOL_PIXELS" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
              </svg>
            </button>
          </li>
        </ul>
        <div v-else class="shop-empty">Coming soon…</div>
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
          <div class="settings-label">Backup:</div>
          <div class="settings-actions">
            <button class="pixel-btn" @click="exportSave">Export</button>
            <button class="pixel-btn" @click="pickImportFile">Import</button>
          </div>
          <input
            ref="importFileInput"
            type="file"
            accept="application/json,.json"
            hidden
            @change="onImportFilePicked"
          />
          <div class="settings-hint">Save to a file, or restore one from another device</div>
          <div v-if="backupError" class="settings-error">{{ backupError }}</div>
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

  <ConfirmDialog
    :show="showImportConfirm"
    title="IMPORT SAVE?"
    message="This replaces your current progress, settings and history."
    confirm-label="Import"
    @cancel="showImportConfirm = false"
    @confirm="confirmImport"
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
  /* Colonne flex : les listes longues (BEST RUNS, HUNT LOG, ACHIEVEMENTS,
     SHOP) défilent DANS leur propre cadre plutôt que de faire défiler tout
     le popup — le titre de section, les chips de tri et "PLAY A SEED"
     restent visibles. L'overflow-y ci-dessus reste un filet de sécurité si
     une page sans liste dédiée (SETTINGS) dépasse 80vh. */
  display: flex;
  flex-direction: column;
}

/* Chaque enfant direct d'une page est figé... */
.menu-panel > * {
  flex-shrink: 0;
}

/* ...sauf les conteneurs de liste, seuls autorisés à rétrécir sous la
   hauteur de leur contenu et à défiler à l'intérieur. min-height: 0 lève
   le minimum implicite (auto) qui, sinon, empêche un flex item de passer
   sous la taille de son contenu. */
.run-list,
.achievement-list,
.shop-list {
  flex-shrink: 1;
  min-height: 0;
  overflow-y: auto;
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
  /* Largeur figée comme .shop-list/.achievement-list : évite que le panneau
     se redimensionne horizontalement selon le contenu des lignes. */
  width: 300px;
  max-width: 100%;
}

/* Lignes de remplissage (LEGACY TIMES) : occupent la même hauteur qu'une
   ligne réelle pour que le nombre de scores dans les autres difficultés
   n'influence pas la taille du panneau. */
.run-row-pad {
  visibility: hidden;
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

/* Temps mis en avant dans la table LEGACY TIMES : police des chiffres du jeu,
   comme le chrono du footer, à l'échelle d'une ligne de liste. */
.run-time {
  font-family: 'Press Start 2P', monospace;
  font-size: 12px;
  color: var(--color-text-strong);
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

.hunt-log-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 14px;
  font-size: 14px;
  color: var(--color-text);
}

.shop-balance {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 16px;
  color: var(--color-text-strong);
}

/* Pièce "hibol" : ~1.1x la hauteur de cap pour peser autant que le nombre
   à côté sans le dominer. Le -sm suit le texte VT323 des boutons Buy. */
.hibol-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.hibol-icon-sm {
  width: 13px;
  height: 13px;
  vertical-align: -2px;
  margin-left: 2px;
}

.shop-empty {
  font-size: 14px;
  color: var(--color-text);
  opacity: 0.7;
}

/* Sous-titre de slot dans Customisation (Mines / Flags) — plus léger qu'un
   .menu-section-title. */
.shop-subhead {
  width: 300px;
  max-width: 100%;
  margin: 14px 0 4px;
  text-align: left;
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--color-text);
  opacity: 0.7;
}

/* Même gabarit que .achievement-list : largeur figée pour ne pas voir le
   panneau se redimensionner, aligné à gauche. */
.shop-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
  width: 300px;
  max-width: 100%;
}

.shop-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-cell-revealed-border);
}

.shop-row:last-child {
  border-bottom: none;
}

.shop-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}

/* min-width: 0 pour que le texte puisse rétrécir/wrapper au lieu de pousser
   le bouton Buy hors du panneau sur écran étroit. */
.shop-text {
  flex: 1;
  min-width: 0;
}

.shop-name {
  font-size: 15px;
  color: var(--color-text-strong);
  font-weight: bold;
}

.shop-owned {
  margin-left: 6px;
  font-size: 13px;
  font-weight: normal;
  color: var(--color-text);
  opacity: 0.7;
}

.shop-desc {
  margin-top: 2px;
  font-size: 14px;
  line-height: 1.3;
  color: var(--color-text);
}

.shop-buy {
  flex-shrink: 0;
  white-space: nowrap;
}

.achievement-list {
  list-style: none;
  margin: 0;
  padding: 0;
  text-align: left;
  /* Largeur figée (et non dérivée du contenu) : sans ça, ouvrir un indice
     plus long que les lignes "???" élargit tout le .menu-panel d'un coup.
     max-width pour rester dans le panneau sur écran étroit. */
  width: 300px;
  max-width: 100%;
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

/* Verrouillée = tapable pour révéler l'indice (cf. template). min-height
   réserve d'emblée la place d'un indice sur deux lignes (le max prévu, vu la
   largeur fixe de .achievement-list) : le "???" est sur une ligne, mais la
   rangée garde la même hauteur une fois l'indice dévoilé — pas de saut
   vertical. 58px = 2 lignes d'indice (~18px) + le padding 10px de
   .achievement-row de part et d'autre. */
.achievement-row-locked {
  cursor: pointer;
  min-height: 58px;
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

/* Prend la place du "???" (même emplacement que .achievement-title) au tap
   sur une ligne verrouillée. Gris atténué via --color-text + opacity plutôt
   qu'une couleur figée, pour rester lisible en thème clair comme sombre. */
.achievement-hint {
  font-size: 14px;
  font-style: italic;
  line-height: 1.3;
  color: var(--color-text);
  opacity: 0.6;
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

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.settings-error {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-danger-fill);
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
