<script setup>
// Contrairement à IntroDialog (texte fixe passé en title-lines/message), ici
// pixels s'ajoute pour l'icône — sinon même idée : le contenu vient du
// site d'appel (App.vue), ce composant ne connaît ni le cœur ni le robot,
// juste "une case spéciale à expliquer". Pas de case "Don't show this
// again" : contrairement à IntroDialog (onboarding vu une fois), cette
// popup s'ouvre à la demande (bouton "?" à côté du compteur concerné) et
// doit pouvoir se rouvrir à volonté.
defineProps({
  show: Boolean,
  pixels: Array,
  name: String,
  description: String
})

defineEmits(['close'])
</script>

<template>
  <div v-if="show" class="help-overlay" @click.self="$emit('close')">
    <div class="help-box">
      <svg viewBox="0 0 9 9" class="help-icon" shape-rendering="crispEdges">
        <rect v-for="(p, i) in pixels" :key="i" :x="p.x" :y="p.y" width="1" height="1" :fill="p.color" />
      </svg>
      <div class="help-title">{{ name }}</div>
      <div class="help-description">{{ description }}</div>
      <div class="help-actions">
        <button class="pixel-btn" @click="$emit('close')">Got it</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Même coquille overlay/box que IntroDialog.vue/ConfirmDialog.vue (fond
   assombri, boîte bordée + ombre portée dure) — seul le contenu change,
   pas de raison de réinventer l'habillage pour une énième popup. */
.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.help-box {
  background: var(--color-panel-bg);
  border: 2px solid var(--color-chrome-border);
  box-shadow: 4px 4px 0 var(--color-border-soft);
  padding: 20px 24px;
  max-width: 280px;
  text-align: center;
  font-family: 'VT323', monospace;
}

.help-icon {
  width: 36px;
  height: 36px;
}

.help-title {
  margin-top: 8px;
  font-family: 'Press Start 2P', monospace;
  font-size: 13px;
  color: var(--color-text-strong);
}

.help-description {
  margin-top: 12px;
  font-size: 16px;
  color: var(--color-text);
  line-height: 1.3;
}

.help-actions {
  margin-top: 16px;
}
</style>
