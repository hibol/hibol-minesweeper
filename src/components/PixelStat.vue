<script setup>
import { computed } from "vue"
import PixelIcon from "./PixelIcon.vue"

// Statistique « sprite + valeur » sans libellé visible : le nom (anglais)
// passe par aria-label pour les lecteurs d'écran et par title au survol.
const props = defineProps({
  pixels: { type: Array, required: true },
  label: { type: String, required: true },
  value: { type: [Number, String], required: true },
  // Côté du sprite en px. Footers : 20 = 70 % de CELL_SIZE, la taille d'une
  // icône dans une case au zoom par défaut. Listes : 14.
  size: { type: Number, default: 14 },
})

const description = computed(() => `${props.label}: ${props.value}`)
</script>

<template>
  <span
    class="pixel-stat"
    role="img"
    :aria-label="description"
    :title="description"
  >
    <PixelIcon
      :pixels="pixels"
      :style="{ width: `${size}px`, height: `${size}px` }"
    />
    {{ value }}
  </span>
</template>

<style scoped>
.pixel-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
}
</style>
