<script setup>
import { ref, computed } from 'vue'
import { MENU_PIXELS } from '../icons'
import { loadTopRuns } from '../runHistory'
import { theme, tapAction } from '../settings'

defineProps({
  infiniteUnlocked: Boolean
})

const emit = defineEmits(['start-infinite-with-seed'])

const isOpen = ref(false)
const topRuns = ref([])
const seedInput = ref('')

const isValidSeed = computed(() => seedInput.value !== '' && Number.isFinite(Number(seedInput.value)))

function toggleMenu() {
  isOpen.value = !isOpen.value

  if (isOpen.value) {
    topRuns.value = loadTopRuns()
  }
}

function closeMenu() {
  isOpen.value = false
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
      <button class="menu-close pixel-btn" @click="closeMenu" aria-label="Close">X</button>

      <div class="menu-section-title">TOP RUNS</div>
      <ol v-if="topRuns.length" class="run-list">
        <li v-for="(run, i) in topRuns" :key="run.timestamp" class="run-row">
          <div class="run-main">
            <span class="run-rank">#{{ i + 1 }}</span>
            <span>{{ run.revealedCount }} cells</span>
            <span>{{ run.distance }} dist</span>
            <span>{{ run.minesTriggeredCount }} mines</span>
          </div>
          <div class="run-meta">{{ formatDate(run.timestamp) }} &middot; seed {{ run.seed }}</div>
        </li>
      </ol>
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

.menu-section-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: var(--color-text-strong);
  margin: 24px 0 14px;
}

.menu-section-title:first-child {
  margin-top: 4px;
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
</style>
