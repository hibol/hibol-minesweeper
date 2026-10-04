<script setup>
import { ref, computed } from "vue"
import {
  HIBOL_PIXELS,
  WIND_MACHINE_PIXELS,
  TRAVEL_MACHINE_PIXELS,
  XRAY_MACHINE_PIXELS,
  SMILEY_PIXELS,
} from "../../icons"
import { hibolBalance } from "../../state/treasureHunt"
import { SHOP_ITEMS, inventory, buy } from "../../state/shop"
import {
  MINE_SKINS,
  FLAG_SKINS,
  equippedMineSkin,
  equippedFlagSkin,
  equipMineSkin,
  equipFlagSkin,
  skinOwned,
} from "../../state/cosmetics"

// Catalogue id -> sprite. Kept here rather than in shop.js so the data module
// stays free of icon imports (same split as the rest: icons.js is the only
// place that knows about pixel grids).
const SHOP_ICONS = {
  windMachine: WIND_MACHINE_PIXELS,
  travelMachine: TRAVEL_MACHINE_PIXELS,
  xrayMachine: XRAY_MACHINE_PIXELS,
  legacyMode: SMILEY_PIXELS,
}

// Une catégorie visible à la fois. `machine` par défaut (la seule non vide
// avec `mode`).
const SHOP_CATEGORIES = [
  { key: "machine", label: "Machines" },
  { key: "cosmetic", label: "Customisation" },
  { key: "mode", label: "Modes" },
]
const shopCategory = ref("machine")
const shopCategoryItems = computed(() =>
  SHOP_ITEMS.filter((item) => item.category === shopCategory.value),
)

// Customisation : deux slots, chacun sa liste de skins (défaut + achetés).
const SKIN_SLOTS = [
  { slot: "mine", title: "Mines", skins: MINE_SKINS },
  { slot: "flag", title: "Flags", skins: FLAG_SKINS },
]

function isEquipped(slot, id) {
  return (slot === "mine" ? equippedMineSkin : equippedFlagSkin).value === id
}

function equipSkin(slot, id) {
  ;(slot === "mine" ? equipMineSkin : equipFlagSkin)(id)
}

// Achat d'un skin : dépense les hibols puis l'équipe d'office.
function buySkin(slot, skin) {
  if (buy(skin.shopId)) {
    equipSkin(slot, skin.id)
  }
}
</script>

<template>
  <section class="menu-page">
    <div class="menu-section-title">SHOP</div>
    <div class="shop-balance">
      <svg viewBox="0 0 9 9" class="hibol-icon" shape-rendering="crispEdges">
        <rect
          v-for="(p, i) in HIBOL_PIXELS"
          :key="i"
          :x="p.x"
          :y="p.y"
          width="1"
          height="1"
          :fill="p.color"
        />
      </svg>
      {{ hibolBalance }} {{ hibolBalance === 1 ? "hibol" : "hibols" }}
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
            <svg
              viewBox="0 0 9 9"
              class="shop-icon"
              shape-rendering="crispEdges"
            >
              <rect
                v-for="(p, i) in skin.pixels"
                :key="i"
                :x="p.x"
                :y="p.y"
                width="1"
                height="1"
                :fill="p.color"
              />
            </svg>
            <div class="shop-text">
              <div class="shop-name">{{ skin.name }}</div>
            </div>
            <button
              v-if="!skinOwned(skin)"
              class="pixel-btn shop-buy"
              :disabled="hibolBalance < 3"
              @click="buySkin(group.slot, skin)"
            >
              Buy&nbsp;&middot;&nbsp;3
              <svg
                viewBox="0 0 9 9"
                class="hibol-icon-sm"
                shape-rendering="crispEdges"
              >
                <rect
                  v-for="(p, i) in HIBOL_PIXELS"
                  :key="i"
                  :x="p.x"
                  :y="p.y"
                  width="1"
                  height="1"
                  :fill="p.color"
                />
              </svg>
            </button>
            <button
              v-else-if="isEquipped(group.slot, skin.id)"
              class="pixel-btn shop-buy"
              disabled
            >
              Equipped
            </button>
            <button
              v-else
              class="pixel-btn shop-buy"
              @click="equipSkin(group.slot, skin.id)"
            >
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
            <span
              v-if="item.category === 'machine' && inventory[item.id]"
              class="shop-owned"
              >x{{ inventory[item.id] }}</span
            >
          </div>
          <div class="shop-desc">{{ item.desc }}</div>
        </div>
        <!-- Un déblocage de mode déjà acheté n'est plus rachetable. -->
        <button
          v-if="item.category === 'mode' && inventory[item.id]"
          class="pixel-btn shop-buy"
          disabled
        >
          Owned
        </button>
        <button
          v-else
          class="pixel-btn shop-buy"
          :disabled="hibolBalance < item.cost"
          @click="buy(item.id)"
        >
          Buy&nbsp;&middot;&nbsp;{{ item.cost }}
          <svg
            viewBox="0 0 9 9"
            class="hibol-icon-sm"
            shape-rendering="crispEdges"
          >
            <rect
              v-for="(p, i) in HIBOL_PIXELS"
              :key="i"
              :x="p.x"
              :y="p.y"
              width="1"
              height="1"
              :fill="p.color"
            />
          </svg>
        </button>
      </li>
    </ul>
    <div v-else class="shop-empty">Coming soon…</div>
  </section>
</template>

<style scoped>
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
   panneau se redimensionner, aligné à gauche, seule partie qui défile. */
.shop-list {
  flex-shrink: 1;
  min-height: 0;
  overflow-y: auto;
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
</style>
