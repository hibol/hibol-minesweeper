import { watch, nextTick, onBeforeUnmount } from 'vue'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Accessibilité d'un dialogue modal : Échap ferme (si `onClose` fourni), Tab
// bouclé dans la boîte, focus déplacé dedans à l'ouverture et rendu à
// l'élément d'origine à la fermeture. Suppose un seul modal ouvert à la fois.
//   isOpen  : getter réactif (() => props.show)
//   boxRef  : ref sur la boîte du dialogue (n'existe que quand isOpen, d'où nextTick)
//   onClose : optionnel — sans lui, Échap ne fait rien (ex. invite de pseudo sans Cancel)
export function useModalA11y(isOpen, boxRef, onClose) {
  let restoreFocusTo = null

  const focusable = () =>
    [...(boxRef.value?.querySelectorAll(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null)

  function onKeydown(e) {
    if (e.key === 'Escape' && onClose) {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab') return

    const items = focusable()
    if (items.length === 0) {
      e.preventDefault()
      boxRef.value?.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(
    isOpen,
    async (open) => {
      if (open) {
        restoreFocusTo = document.activeElement
        document.addEventListener('keydown', onKeydown)
        await nextTick()
        ;(focusable()[0] ?? boxRef.value)?.focus()
      } else {
        document.removeEventListener('keydown', onKeydown)
        restoreFocusTo?.focus?.()
        restoreFocusTo = null
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
}
