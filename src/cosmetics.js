import { ref, computed, watch } from 'vue'
import {
  MINE_PIXELS, FLAG_PIXELS,
  DYNAMITE_PIXELS, BARREL_PIXELS,
  FLAG_SQUARE_PIXELS, FLAG_SWALLOW_PIXELS, FLAG_ROUND_PIXELS
} from './icons'
import { SHOP_ITEMS, inventory } from './shop'

// Skins cosmétiques : une variante par défaut (gratuite, toujours possédée) +
// les variantes achetées au shop (catégorie 'cosmetic', 3 hibols), qu'on peut
// ensuite équiper / changer librement sans racheter. Persisté par slot.
//
// `shopId` : l'entrée SHOP_ITEMS correspondante (null pour le défaut). `pixels`
// : la grille rendue par MineCell.vue et les compteurs du footer.

const SKIN_PIXELS = {
  mineDynamite: DYNAMITE_PIXELS,
  mineBarrel: BARREL_PIXELS,
  flagSquare: FLAG_SQUARE_PIXELS,
  flagSwallow: FLAG_SWALLOW_PIXELS,
  flagRound: FLAG_ROUND_PIXELS
}

function skinsForSlot(slot, defaultPixels) {
  return [
    { id: 'default', shopId: null, name: 'Classic', pixels: defaultPixels },
    ...SHOP_ITEMS.filter((item) => item.category === 'cosmetic' && item.slot === slot).map((item) => ({
      id: item.id,
      shopId: item.id,
      name: item.name,
      pixels: SKIN_PIXELS[item.id]
    }))
  ]
}

export const MINE_SKINS = skinsForSlot('mine', MINE_PIXELS)
export const FLAG_SKINS = skinsForSlot('flag', FLAG_PIXELS)

const MINE_SKIN_KEY = 'hibol-minesweeper:mine-skin'
const FLAG_SKIN_KEY = 'hibol-minesweeper:flag-skin'

function loadEquipped(key, skins) {
  const stored = localStorage.getItem(key)
  return skins.some((skin) => skin.id === stored) ? stored : 'default'
}

// Singletons réactifs (même pattern que settings.js).
export const equippedMineSkin = ref(loadEquipped(MINE_SKIN_KEY, MINE_SKINS))
export const equippedFlagSkin = ref(loadEquipped(FLAG_SKIN_KEY, FLAG_SKINS))

watch(equippedMineSkin, (value) => {
  try {
    localStorage.setItem(MINE_SKIN_KEY, value)
  } catch {
    // plein / indisponible : le choix en mémoire tient pour la session
  }
})

watch(equippedFlagSkin, (value) => {
  try {
    localStorage.setItem(FLAG_SKIN_KEY, value)
  } catch {
    // idem
  }
})

// Le défaut est toujours possédé ; les autres dépendent de l'inventaire shop.
export function skinOwned(skin) {
  return skin.shopId === null || (inventory.value[skin.shopId] ?? 0) > 0
}

function equip(skins, equippedRef, id) {
  const skin = skins.find((entry) => entry.id === id)

  if (skin && skinOwned(skin)) {
    equippedRef.value = id
  }
}

export function equipMineSkin(id) {
  equip(MINE_SKINS, equippedMineSkin, id)
}

export function equipFlagSkin(id) {
  equip(FLAG_SKINS, equippedFlagSkin, id)
}

// Grille effectivement rendue : le skin équipé s'il est (encore) possédé,
// sinon le défaut — garde-fou si une sauvegarde importée référence un skin
// non acheté.
function resolvePixels(skins, equippedId) {
  const skin = skins.find((entry) => entry.id === equippedId)
  return skin && skinOwned(skin) ? skin.pixels : skins[0].pixels
}

export const mineSkinPixels = computed(() => resolvePixels(MINE_SKINS, equippedMineSkin.value))
export const flagSkinPixels = computed(() => resolvePixels(FLAG_SKINS, equippedFlagSkin.value))
