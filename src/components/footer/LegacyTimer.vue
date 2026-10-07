<script setup>
import PixelIcon from "../PixelIcon.vue"
import { STOPWATCH_PIXELS } from "../../icons"

// Chrono du footer Legacy, mm:ss.cc.
defineProps({
  label: { type: String, required: true },
})
</script>

<template>
  <div class="legacy-timer-row">
    <PixelIcon :pixels="STOPWATCH_PIXELS" class="legacy-timer-icon" />
    <span class="legacy-timer">{{ label }}</span>
  </div>
</template>

<style scoped>
/* Seul sur la 1re ligne, plus gros que les stats normales (Press Start 2P
   comme les chiffres du plateau / le titre des bannières), avec l'icône
   stopwatch à gauche. */
.legacy-timer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legacy-timer-icon {
  width: 22px;
  height: 22px;
}

.legacy-timer {
  font-family: "Press Start 2P", monospace;
  font-size: 20px;
  color: var(--color-text-strong);
  letter-spacing: 1px;
}
</style>
