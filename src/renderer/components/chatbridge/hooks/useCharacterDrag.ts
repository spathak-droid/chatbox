import { useCallback, useRef } from 'react'
import gsap from 'gsap'

interface UseCharacterDragParams {
  outerRef: React.RefObject<HTMLDivElement | null>
  roamDelayRef: React.MutableRefObject<gsap.core.Tween | null>
  walkTimelineRef: React.MutableRefObject<gsap.core.Timeline | null>
  selectedRef: React.MutableRefObject<boolean>
  stopWalking: () => void
  resetPose: () => void
  showDanceMenu: boolean
  setShowDanceMenu: (show: boolean) => void
  setSelected: (selected: boolean) => void
}

export function useCharacterDrag({
  outerRef,
  roamDelayRef,
  walkTimelineRef,
  selectedRef,
  stopWalking,
  resetPose,
  showDanceMenu,
  setShowDanceMenu,
  setSelected,
}: UseCharacterDragParams) {
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, elX: 0, elY: 0 })
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMovedRef = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const outer = outerRef.current
    if (!outer) return

    // Close dance menu if open
    if (showDanceMenu) {
      setShowDanceMenu(false)
      return
    }

    hasMovedRef.current = false
    draggingRef.current = true
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elX: (gsap.getProperty(outer, 'x') as number) || 0,
      elY: (gsap.getProperty(outer, 'y') as number) || 0,
    }

    gsap.killTweensOf(outer, 'x,y')
    roamDelayRef.current?.kill()
    stopWalking()

    if (!selectedRef.current) {
      setSelected(true)
    }

    // Start long-press timer (600ms without moving = dance menu)
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      if (!hasMovedRef.current) {
        draggingRef.current = false
        setShowDanceMenu(true)
      }
    }, 600)

    const handleMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !outer) return
      const dx = ev.clientX - dragStartRef.current.mouseX
      const dy = ev.clientY - dragStartRef.current.mouseY
      // Mark as moved if dragged more than 5px
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasMovedRef.current = true
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }
      gsap.set(outer, {
        x: dragStartRef.current.elX + dx,
        y: dragStartRef.current.elY + dy,
      })
    }

    const handleMouseUp = () => {
      draggingRef.current = false
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = null
      }
      if (!showDanceMenu) {
        setSelected(false)
        resetPose()
      }
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [outerRef, roamDelayRef, stopWalking, resetPose, showDanceMenu, setShowDanceMenu, setSelected, selectedRef])

  return { handleMouseDown, draggingRef, dragStartRef }
}
