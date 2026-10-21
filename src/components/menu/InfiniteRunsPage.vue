<script setup>
import { ref, computed } from "vue"
import { loadTopRuns } from "../../state/runHistory"
import { hasFoundHeart, hasFoundRobot } from "../../state/discoveries"
import { fetchInfiniteLeaderboard } from "../../state/infiniteOnline"
import { useLeaderboard } from "../../composables/useLeaderboard"
import { formatDate, formatDateTime } from "../../dateFormat"
import InfiniteRunRow from "../InfiniteRunRow.vue"
import LeaderboardList from "./LeaderboardList.vue"

const props = defineProps({
  infiniteUnlocked: Boolean,
  // Pousse la run en cours au serveur (cf. useInfiniteProgressPush) : appelé
  // avant chaque lecture du classement en ligne, pour que le joueur s'y voie.
  pushProgress: { type: Function, default: null },
})

const emit = defineEmits(["start-infinite-with-seed"])

// Relu à chaque ouverture : la page est recréée à chaque fois.
const topRuns = loadTopRuns()

// Mêmes puces en local et en ligne. Le tri local (roadmap point 19) est
// purement un tri d'affichage, qui ne touche jamais à runHistory.js (les runs
// restent stockées/limitées à 10 par ordre revealedCount décroissant, cf.
// recordRun). En ligne, seules les deux métriques que le serveur classe
// (`onlineMetric`) : trier un top 50 par mines n'en donnerait pas le top mines.
const SORT_CRITERIA = [
  { key: "revealedCount", label: "Cells", onlineMetric: "cells" },
  { key: "distance", label: "Distance", onlineMetric: "distance" },
  { key: "minesTriggeredCount", label: "Mines" },
  { key: "heartsCollectedCount", label: "Hearts", requires: hasFoundHeart },
  { key: "robotsTriggeredCount", label: "Robots", requires: hasFoundRobot },
]

const source = ref("local")

// Trier par cœurs/robots n'a aucun intérêt tant que le joueur n'en a jamais
// croisé (tout à 0) — masque le chip plutôt que de l'afficher inutilement.
const visibleSortCriteria = computed(() =>
  SORT_CRITERIA.filter((criterion) =>
    source.value === "local"
      ? !criterion.requires || criterion.requires.value
      : criterion.onlineMetric,
  ),
)

const sortKey = ref("revealedCount")
const sortDir = ref("desc")
const onlineMetric = ref("cells")

function isSortActive(criterion) {
  return source.value === "local"
    ? sortKey.value === criterion.key
    : onlineMetric.value === criterion.onlineMetric
}

function onSortClick(criterion) {
  if (source.value === "local") {
    setSort(criterion.key)
  } else {
    onlineMetric.value = criterion.onlineMetric
    loadOnline()
  }
}

function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "desc" ? "asc" : "desc"
  } else {
    sortKey.value = key
    sortDir.value = "desc"
  }
}

// Une seule puce pour les deux sources. Local : seules les runs enregistrées
// sans machine (les anciennes n'ont pas le champ, rien ne prouve qu'elles en
// étaient exemptes). En ligne : la catégorie "clean" du serveur.
const withoutMachines = ref(false)

function toggleWithoutMachines() {
  withoutMachines.value = !withoutMachines.value
  if (source.value === "online") {
    loadOnline()
  }
}

// ?? 0 : les runs enregistrées avant l'ajout des cœurs/robots (roadmap point
// 9) n'ont pas ces champs — les traiter comme 0 plutôt que undefined, sinon
// la soustraction du comparateur produit NaN et casse le tri.
const sortedRuns = computed(() => {
  const factor = sortDir.value === "desc" ? -1 : 1
  const runs = withoutMachines.value
    ? topRuns.filter((run) => run.usedMachines === false)
    : topRuns
  return [...runs].sort(
    (a, b) => factor * ((a[sortKey.value] ?? 0) - (b[sortKey.value] ?? 0)),
  )
})

// Au-delà, le classement s'affiche sans attendre le push.
const PUSH_TIMEOUT_MS = 3000

// Attend la fin du push, sans dépasser PUSH_TIMEOUT_MS ni jamais échouer :
// le classement s'affiche même si le serveur est lent ou injoignable.
async function pushProgressBriefly() {
  if (!props.pushProgress) {
    return
  }

  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, PUSH_TIMEOUT_MS)
  })
  try {
    await Promise.race([
      Promise.resolve()
        .then(() => props.pushProgress())
        .catch(() => {}),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}

const {
  list: onlineList,
  status: onlineStatus,
  maxCount: onlineMaxCount,
  load: loadOnline,
} = useLeaderboard(
  computed(() => `${onlineMetric.value}:${withoutMachines.value}`),
  // Tout vient de la clé : la lecture a lieu après le push, le joueur a pu
  // changer de puce entre-temps.
  (key) => {
    const [metric, cleanOnly] = key.split(":")
    return fetchInfiniteLeaderboard(metric, cleanOnly === "true")
  },
  { beforeFetch: pushProgressBriefly },
)

function setSource(value) {
  source.value = value
  if (value === "online" && onlineStatus.value === "idle") {
    loadOnline()
  }
}

function onlineRowKey(row) {
  return `${row.username}-${row.submittedAt}`
}

// Les deux sources nomment leurs champs différemment : une forme commune pour
// InfiniteRunRow.
function localStats(run) {
  return {
    revealedCount: run.revealedCount,
    distance: run.distance,
    minesTriggered: run.minesTriggeredCount,
    heartsCollected: run.heartsCollectedCount,
    robotsTriggered: run.robotsTriggeredCount,
  }
}

function onlineStats(row) {
  return {
    revealedCount: row.revealedCount,
    distance: Math.round(row.maxDistance),
    minesTriggered: row.minesTriggered,
    heartsCollected: row.heartsCollected,
    robotsTriggered: row.robotsTriggered,
  }
}

function onlineMachineUses(row) {
  return {
    windMachine: row.windMachineUses,
    travelMachine: row.travelMachineUses,
    xrayMachine: row.xrayMachineUses,
  }
}

const seedInput = ref("")

const isValidSeed = computed(
  () => seedInput.value !== "" && Number.isFinite(Number(seedInput.value)),
)

function submitSeed() {
  if (!isValidSeed.value) {
    return
  }

  emit("start-infinite-with-seed", Number(seedInput.value))
  seedInput.value = ""
}
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">INFINITE RUNS</div>
    <!-- Local (runHistory.js, top perso sur cet appareil) vs Online
         (classement serveur, cf. infiniteOnline.js) — deux sources
         distinctes, jamais mélangées (même principe que LEGACY TIMES). -->
    <div class="sort-chips">
      <button
        class="sort-chip"
        :class="{ active: source === 'local' }"
        @click="setSource('local')"
      >
        Local
      </button>
      <button
        class="sort-chip"
        :class="{ active: source === 'online' }"
        @click="setSource('online')"
      >
        Online
      </button>
    </div>

    <div v-if="source === 'local' && !topRuns.length" class="run-empty">
      No runs yet
    </div>

    <template v-else>
      <div class="sort-chips">
        <button
          v-for="criterion in visibleSortCriteria"
          :key="criterion.key"
          class="sort-chip"
          :class="{ active: isSortActive(criterion) }"
          @click="onSortClick(criterion)"
        >
          {{ criterion.label }}
          <span
            v-if="source === 'local' && isSortActive(criterion)"
            class="sort-arrow"
            >{{ sortDir === "desc" ? "▼" : "▲" }}</span
          >
        </button>
      </div>
      <div class="sort-chips">
        <button
          class="sort-chip"
          :class="{ active: withoutMachines }"
          :aria-pressed="withoutMachines"
          @click="toggleWithoutMachines"
        >
          Without machines only
        </button>
      </div>

      <template v-if="source === 'local'">
        <ol v-if="sortedRuns.length" class="run-list">
          <li
            v-for="(run, i) in sortedRuns"
            :key="run.timestamp"
            class="run-row"
          >
            <InfiniteRunRow
              :rank="i + 1"
              :stats="localStats(run)"
              :machine-uses="run.machineUses"
              :date="formatDateTime(run.timestamp)"
              :seed="run.seed"
            />
          </li>
        </ol>
        <div v-else class="run-empty">No runs without machines</div>
        <div v-if="sortedRuns.length" class="settings-hint">
          Long press to copy the seed
        </div>
      </template>

      <LeaderboardList
        v-else
        :rows="onlineList"
        :status="onlineStatus"
        :pad-count="onlineMaxCount"
        :row-key="onlineRowKey"
        error-message="Couldn't load — tap a chip to retry"
      >
        <template #row="{ row, rank }">
          <InfiniteRunRow
            :rank="rank"
            :username="row.username"
            :stats="onlineStats(row)"
            :machine-uses="onlineMachineUses(row)"
            :date="formatDate(row.submittedAt)"
          />
        </template>
      </LeaderboardList>
    </template>

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
      <button
        type="submit"
        class="pixel-btn"
        :disabled="!infiniteUnlocked || !isValidSeed"
      >
        Start
      </button>
    </form>
  </section>
</template>

<style scoped>
.sort-arrow {
  font-size: 11px;
}
</style>
