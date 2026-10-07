<script setup>
import PixelStat from "../PixelStat.vue"
import PixelIcon from "../PixelIcon.vue"
import { HELP_PIXELS } from "../../icons"
import { FOOTER_ICON_SIZE } from "./footer.js"

// Stat de case spéciale (sprite + valeur) suivie, si showHelp, d'un bouton « ? »
// qui demande son explication : l'événement `help` est traité par le parent.
defineProps({
  pixels: { type: Array, required: true },
  label: { type: String, required: true },
  value: { type: [Number, String], required: true },
  showHelp: Boolean,
  helpLabel: { type: String, required: true },
})

defineEmits(["help"])
</script>

<template>
  <span class="stat">
    <PixelStat
      :pixels="pixels"
      :label="label"
      :value="value"
      :size="FOOTER_ICON_SIZE"
    />
    <button
      v-if="showHelp"
      class="help-btn"
      :aria-label="helpLabel"
      @click="$emit('help')"
    >
      <PixelIcon :pixels="HELP_PIXELS" class="help-btn-icon" />
    </button>
  </span>
</template>

<style scoped src="./stat.css"></style>
<style scoped>
/* Pas de bordure propre : le badge pixel-art dessine déjà sa silhouette,
   une bordure carrée en plus ferait double cadre. */
.help-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  margin: -4px 0;
  background: none;
  border: none;
  cursor: pointer;
}

.help-btn-icon {
  width: 15px;
  height: 15px;
}
</style>
