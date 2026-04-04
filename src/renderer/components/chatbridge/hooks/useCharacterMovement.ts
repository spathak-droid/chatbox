import { useCallback, useEffect, useRef } from 'react'
import gsap from 'gsap'
import type { CharacterMode } from '../types'

interface UseCharacterMovementParams {
  outerRef: React.RefObject<HTMLDivElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  leftLegRef: React.RefObject<SVGRectElement | null>
  rightLegRef: React.RefObject<SVGRectElement | null>
  walkTimelineRef: React.MutableRefObject<gsap.core.Timeline | null>
  roamDelayRef: React.MutableRefObject<gsap.core.Tween | null>
  followRafRef: React.MutableRefObject<number | null>
  mousePositionRef: React.MutableRefObject<{ x: number; y: number }>
  modeRef: React.MutableRefObject<CharacterMode>
  selectedRef: React.MutableRefObject<boolean>
  followCursorRef: React.MutableRefObject<boolean>
  followCursor: boolean
  mouthRef: React.RefObject<SVGPathElement | null>
  leftEyeRef: React.RefObject<SVGCircleElement | null>
  rightEyeRef: React.RefObject<SVGCircleElement | null>
  stopWalkingExternal?: () => void
  resetPose: () => void
}

export function useCharacterMovement({
  outerRef,
  containerRef,
  leftLegRef,
  rightLegRef,
  walkTimelineRef,
  roamDelayRef,
  followRafRef,
  mousePositionRef,
  modeRef,
  selectedRef,
  followCursorRef,
  followCursor,
  mouthRef,
  leftEyeRef,
  rightEyeRef,
  resetPose,
}: UseCharacterMovementParams) {
  const createWalkAnimation = useCallback(() => {
    const tl = gsap.timeline({ repeat: -1 })
    if (leftLegRef.current && rightLegRef.current) {
      tl.to(leftLegRef.current, { rotation: 15, transformOrigin: '50% 0%', duration: 0.2, ease: 'sine.inOut' }, 0)
      tl.to(rightLegRef.current, { rotation: -15, transformOrigin: '50% 0%', duration: 0.2, ease: 'sine.inOut' }, 0)
      tl.to(leftLegRef.current, { rotation: -15, duration: 0.2, ease: 'sine.inOut' }, 0.2)
      tl.to(rightLegRef.current, { rotation: 15, duration: 0.2, ease: 'sine.inOut' }, 0.2)
    }
    return tl
  }, [leftLegRef, rightLegRef])

  const stopWalking = useCallback(() => {
    if (walkTimelineRef.current) {
      walkTimelineRef.current.kill()
      walkTimelineRef.current = null
    }
    if (leftLegRef.current) gsap.to(leftLegRef.current, { rotation: 0, duration: 0.15 })
    if (rightLegRef.current) gsap.to(rightLegRef.current, { rotation: 0, duration: 0.15 })
  }, [walkTimelineRef, leftLegRef, rightLegRef])

  const walkTo = useCallback((targetX: number, targetY: number, onArrive: () => void) => {
    const outer = outerRef.current
    if (!outer) { onArrive(); return }

    const currentX = (gsap.getProperty(outer, 'x') as number) || 0
    const distance = Math.abs(targetX - currentX)
    const duration = Math.max(1, Math.min(2.5, distance / 200))

    const scaleX = targetX < currentX ? -1 : 1
    gsap.to(outer, { scaleX, duration: 0.15 })

    stopWalking()
    walkTimelineRef.current = createWalkAnimation()

    gsap.to(outer, {
      x: targetX,
      y: targetY,
      duration,
      ease: 'power2.inOut',
      onComplete: () => {
        stopWalking()
        gsap.to(outer, { scaleX: 1, duration: 0.15 })
        onArrive()
      },
    })
  }, [outerRef, walkTimelineRef, createWalkAnimation, stopWalking])

  // Roaming (idle only)
  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return

    const roam = () => {
      if (modeRef.current !== 'idle' || selectedRef.current || followCursorRef.current) return
      const container = containerRef.current
      if (!container) { roamDelayRef.current = gsap.delayedCall(2, roam); return }

      const maxX = Math.max(0, container.offsetWidth - 100)
      const maxY = Math.max(0, container.offsetHeight - 120)
      const targetX = 20 + Math.random() * (maxX - 20)
      const targetY = 20 + Math.random() * (maxY - 20)

      walkTo(targetX, targetY, () => {
        if (modeRef.current === 'idle' && !selectedRef.current) {
          roamDelayRef.current = gsap.delayedCall(3 + Math.random() * 3, roam)
        }
      })
    }

    roamDelayRef.current = gsap.delayedCall(2, roam)
    return () => { roamDelayRef.current?.kill() }
  }, [outerRef, containerRef, walkTo, modeRef, selectedRef, followCursorRef, roamDelayRef])

  // Follow cursor mode
  useEffect(() => {
    const container = containerRef.current
    const outer = outerRef.current
    if (!container || !outer) return

    if (!followCursor) {
      // Stop following
      if (followRafRef.current) {
        cancelAnimationFrame(followRafRef.current)
        followRafRef.current = null
      }
      stopWalking()
      return
    }

    // Kill any existing roaming/mode animations
    roamDelayRef.current?.kill()
    gsap.killTweensOf(outer, 'x,y')

    // Initialize mouse position to character's current position (avoid jump to 0,0)
    mousePositionRef.current = {
      x: (gsap.getProperty(outer, 'x') as number) || 0,
      y: (gsap.getProperty(outer, 'y') as number) || 0,
    }

    // Track mouse position relative to container
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mousePositionRef.current = {
        x: e.clientX - rect.left - 40, // center character (80px wide / 2)
        y: e.clientY - rect.top - 50,  // center vertically
      }
    }
    document.addEventListener('mousemove', handleMouseMove)

    // Start walk animation
    walkTimelineRef.current = createWalkAnimation()

    // Smoothly follow cursor using GSAP
    let isWalking = false
    const follow = () => {
      if (!followCursorRef.current || !outer) return

      const currentX = (gsap.getProperty(outer, 'x') as number) || 0
      const currentY = (gsap.getProperty(outer, 'y') as number) || 0
      const targetX = mousePositionRef.current.x
      const targetY = mousePositionRef.current.y
      const dx = targetX - currentX
      const dy = targetY - currentY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 15) {
        // Face direction of movement
        const scaleX = dx < 0 ? -1 : 1
        gsap.set(outer, { scaleX })

        // Smooth follow with easing
        gsap.to(outer, {
          x: currentX + dx * 0.08,
          y: currentY + dy * 0.08,
          duration: 0.05,
          overwrite: 'auto',
        })

        if (!isWalking) {
          isWalking = true
          stopWalking()
          walkTimelineRef.current = createWalkAnimation()
        }

        // Happy face while following
        if (mouthRef.current) gsap.set(mouthRef.current, { attr: { d: 'M 30 66 Q 40 78 50 66' } })
        const eyes = [leftEyeRef.current, rightEyeRef.current].filter(Boolean)
        gsap.set(eyes, { attr: { r: 9 }, scaleY: 1, transformOrigin: '50% 50%' })
      } else {
        if (isWalking) {
          isWalking = false
          stopWalking()
        }
      }

      followRafRef.current = requestAnimationFrame(follow)
    }

    followRafRef.current = requestAnimationFrame(follow)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      if (followRafRef.current) {
        cancelAnimationFrame(followRafRef.current)
        followRafRef.current = null
      }
      stopWalking()
      gsap.to(outer, { scaleX: 1, duration: 0.15 })
      resetPose()
    }
  }, [followCursor, containerRef, outerRef, createWalkAnimation, stopWalking, resetPose, roamDelayRef, followRafRef, mousePositionRef, followCursorRef, walkTimelineRef, mouthRef, leftEyeRef, rightEyeRef])

  return { walkTo, stopWalking, createWalkAnimation }
}
