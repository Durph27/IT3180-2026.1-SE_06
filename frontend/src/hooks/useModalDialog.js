import { useEffect, useRef } from 'react'

export function useModalDialog(onClose, busy) {
  const ref = useRef(null)
  const pressedOutside = useRef(false)
  useEffect(() => {
    const dialog = ref.current
    const trigger = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])
  useEffect(() => {
    const dialog = ref.current
    const outside = (event) => {
      const rect = dialog.getBoundingClientRect()
      return event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom
    }
    const cancel = (event) => { event.preventDefault(); if (!busy) onClose() }
    const down = (event) => { pressedOutside.current = outside(event) }
    const up = (event) => { if (!busy && pressedOutside.current && outside(event)) onClose(); pressedOutside.current = false }
    dialog.addEventListener('cancel', cancel)
    dialog.addEventListener('pointerdown', down)
    dialog.addEventListener('pointerup', up)
    return () => {
      dialog.removeEventListener('cancel', cancel)
      dialog.removeEventListener('pointerdown', down)
      dialog.removeEventListener('pointerup', up)
    }
  }, [onClose, busy])
  return ref
}
