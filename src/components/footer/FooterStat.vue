<script setup>
import PixelStat from "../PixelStat.vue"
import { FOOTER_ICON_SIZE } from "./footer.js"

// Stat « sprite + valeur » du footer : un PixelStat à la taille des footers,
// posé comme .stat dans la ligne de stats.
defineProps({
  pixels: { type: Array, required: true },
  label: { type: String, required: true },
  value: { type: [Number, String], required: true },
})
</script>

<template>
  <PixelStat
    class="stat"
    :pixels="pixels"
    :label="label"
    :value="value"
    :size="FOOTER_ICON_SIZE"
  />
</template>

<style scoped src="./stat.css"></style>
