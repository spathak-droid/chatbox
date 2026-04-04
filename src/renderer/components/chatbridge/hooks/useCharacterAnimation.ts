import { useCallback, useEffect } from 'react'
import gsap from 'gsap'
import type { CharacterMode } from '../types'

interface UseCharacterAnimationParams {
  mode: CharacterMode
  selected: boolean
  followCursor: boolean
  outerRef: React.RefObject<HTMLDivElement | null>
  bobRef: React.RefObject<HTMLDivElement | null>
  leftEyeRef: React.RefObject<SVGCircleElement | null>
  rightEyeRef: React.RefObject<SVGCircleElement | null>
  leftPupilRef: React.RefObject<SVGCircleElement | null>
  rightPupilRef: React.RefObject<SVGCircleElement | null>
  mouthRef: React.RefObject<SVGPathElement | null>
  leftArmRef: React.RefObject<SVGRectElement | null>
  rightArmRef: React.RefObject<SVGRectElement | null>
  leftLegRef: React.RefObject<SVGRectElement | null>
  rightLegRef: React.RefObject<SVGRectElement | null>
  antennaRef: React.RefObject<SVGCircleElement | null>
  thoughtDotsRef: React.RefObject<SVGGElement | null>
  modeTimelineRef: React.MutableRefObject<gsap.core.Timeline | null>
  selectedTimelineRef: React.MutableRefObject<gsap.core.Timeline | null>
  danceTimelineRef: React.MutableRefObject<gsap.core.Timeline | null>
  roamDelayRef: React.MutableRefObject<gsap.core.Tween | null>
  modeRef: React.MutableRefObject<CharacterMode>
  selectedRef: React.MutableRefObject<boolean>
  followCursorRef: React.MutableRefObject<boolean>
  containerRef: React.RefObject<HTMLDivElement | null>
  walkTo: (targetX: number, targetY: number, onArrive: () => void) => void
  stopWalking: () => void
  setShowDanceMenu: (show: boolean) => void
}

export function useCharacterAnimation({
  mode,
  selected,
  followCursor,
  outerRef,
  bobRef,
  leftEyeRef,
  rightEyeRef,
  leftPupilRef,
  rightPupilRef,
  mouthRef,
  leftArmRef,
  rightArmRef,
  leftLegRef,
  rightLegRef,
  antennaRef,
  thoughtDotsRef,
  modeTimelineRef,
  selectedTimelineRef,
  danceTimelineRef,
  roamDelayRef,
  modeRef,
  selectedRef,
  followCursorRef,
  containerRef,
  walkTo,
  stopWalking,
  setShowDanceMenu,
}: UseCharacterAnimationParams) {
  const resetPose = useCallback(() => {
    const pupils = [leftPupilRef.current, rightPupilRef.current].filter(Boolean)
    const eyes = [leftEyeRef.current, rightEyeRef.current].filter(Boolean)
    gsap.to(pupils, { attr: { cy: 52 }, duration: 0.3 })
    if (leftPupilRef.current) gsap.to(leftPupilRef.current, { attr: { cx: 32 }, duration: 0.3 })
    if (rightPupilRef.current) gsap.to(rightPupilRef.current, { attr: { cx: 52 }, duration: 0.3 })
    gsap.to(eyes, { scaleY: 1, attr: { r: 8 }, duration: 0.3, transformOrigin: 'center center' })
    if (mouthRef.current) gsap.to(mouthRef.current, { attr: { d: 'M 32 68 Q 40 74 48 68' }, duration: 0.3 })
    if (rightArmRef.current) gsap.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 })
    if (leftArmRef.current) gsap.to(leftArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 })
    if (thoughtDotsRef.current) gsap.to(thoughtDotsRef.current, { opacity: 0, duration: 0.2 })
    if (outerRef.current) gsap.to(outerRef.current, { rotation: 0, duration: 0.3 })
  }, [leftPupilRef, rightPupilRef, leftEyeRef, rightEyeRef, mouthRef, rightArmRef, leftArmRef, thoughtDotsRef, outerRef])

  const startMoodAnimation = useCallback((currentMode: CharacterMode) => {
    if (modeTimelineRef.current) {
      modeTimelineRef.current.kill()
      modeTimelineRef.current = null
    }

    if (currentMode === 'thinking') {
      const tl = gsap.timeline({ repeat: -1 })
      modeTimelineRef.current = tl
      tl.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), { attr: { cy: 49, cx: '+=2' }, duration: 0.5, ease: 'power2.out' }, 0)
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 33 68 Q 40 68 47 68' }, duration: 0.3 }, 0)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: -45, transformOrigin: '50% 0%', x: -8, y: -5, duration: 0.5, ease: 'power2.out' }, 0)
      if (thoughtDotsRef.current) {
        tl.to(thoughtDotsRef.current, { opacity: 1, duration: 0.3 }, 0.3)
        tl.to(thoughtDotsRef.current.children, { y: -3, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.15 }, 0.5)
      }
    }

    if (currentMode === 'tool_executing') {
      const tl = gsap.timeline({ repeat: -1 })
      modeTimelineRef.current = tl
      tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), { scaleY: 0.7, transformOrigin: '50% 50%', duration: 0.3 }, 0)
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: -20, transformOrigin: '50% 0%', duration: 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 20, transformOrigin: '50% 0%', duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0)
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 34 68 Q 40 66 46 68' }, duration: 0.3 }, 0)
    }

    if (currentMode === 'streaming') {
      const tl = gsap.timeline({ repeat: -1 })
      modeTimelineRef.current = tl
      tl.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), { attr: { cy: 55 }, duration: 0.5, ease: 'power2.out' }, 0)
      if (leftPupilRef.current) tl.to(leftPupilRef.current, { attr: { cx: 32 }, duration: 0.3 }, 0)
      if (rightPupilRef.current) tl.to(rightPupilRef.current, { attr: { cx: 52 }, duration: 0.3 }, 0)
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 32 68 Q 40 74 48 68' }, duration: 0.3 }, 0)
      if (outerRef.current) tl.to(outerRef.current, { rotation: 3, duration: 0.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0)
    }

    if (currentMode === 'celebrating') {
      const outer = outerRef.current
      if (!outer) return
      const tl = gsap.timeline({ repeat: 2 })
      modeTimelineRef.current = tl
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 30 66 Q 40 80 50 66' }, duration: 0.2 }, 0)
      tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), { scaleY: 0.3, transformOrigin: '50% 50%', duration: 0.2 }, 0)
      tl.to(outer, { y: '-=30', duration: 0.3, ease: 'power2.out' }, 0)
      tl.to(outer, { y: '+=30', duration: 0.3, ease: 'bounce.out' }, 0.3)
      if (leftArmRef.current) {
        tl.to(leftArmRef.current, { rotation: -60, transformOrigin: '50% 0%', duration: 0.2 }, 0)
        tl.to(leftArmRef.current, { rotation: -30, duration: 0.15, yoyo: true, repeat: 3 }, 0.2)
        tl.to(leftArmRef.current, { rotation: 0, duration: 0.2 }, 0.8)
      }
      if (rightArmRef.current) {
        tl.to(rightArmRef.current, { rotation: 60, transformOrigin: '50% 0%', duration: 0.2 }, 0)
        tl.to(rightArmRef.current, { rotation: 30, duration: 0.15, yoyo: true, repeat: 3 }, 0.2)
        tl.to(rightArmRef.current, { rotation: 0, duration: 0.2 }, 0.8)
      }
    }

    if (currentMode === 'confused') {
      const outer = outerRef.current
      if (!outer) return
      const tl = gsap.timeline({ repeat: 2 })
      modeTimelineRef.current = tl
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 32 70 Q 36 66 40 70 Q 44 74 48 70' }, duration: 0.3 }, 0)
      if (leftEyeRef.current) tl.to(leftEyeRef.current, { attr: { r: 6 }, duration: 0.3 }, 0)
      if (rightEyeRef.current) tl.to(rightEyeRef.current, { attr: { r: 9 }, duration: 0.3 }, 0)
      if (rightArmRef.current) {
        tl.to(rightArmRef.current, { rotation: -70, x: -15, y: -20, transformOrigin: '50% 0%', duration: 0.4 }, 0)
        tl.to(rightArmRef.current, { rotation: -60, duration: 0.2, yoyo: true, repeat: 3 }, 0.4)
        tl.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 }, 1)
      }
      tl.to(outer, { rotation: -8, duration: 0.3, ease: 'power2.out' }, 0)
      tl.to(outer, { rotation: 0, duration: 0.3 }, 1)
    }
  }, [modeTimelineRef, leftPupilRef, rightPupilRef, mouthRef, rightArmRef, leftArmRef, thoughtDotsRef, leftEyeRef, rightEyeRef, outerRef])

  const playDance = useCallback((danceName: string) => {
    setShowDanceMenu(false)
    if (danceTimelineRef.current) {
      danceTimelineRef.current.kill()
      danceTimelineRef.current = null
    }
    resetPose()

    const outer = outerRef.current
    const bob = bobRef.current
    if (!outer || !bob) return

    const tl = gsap.timeline({
      onComplete: () => {
        danceTimelineRef.current = null
        resetPose()
      },
    })
    danceTimelineRef.current = tl

    // Happy mouth for all dances
    if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 30 66 Q 40 80 50 66' }, duration: 0.15 }, 0)
    // Happy eyes
    tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), { scaleY: 0.4, transformOrigin: '50% 50%', duration: 0.15 }, 0)

    if (danceName === 'spin') {
      tl.to(outer, { rotation: 360, duration: 0.6, ease: 'power2.inOut' }, 0)
      tl.to(outer, { rotation: 720, duration: 0.6, ease: 'power2.inOut' }, 0.6)
      tl.set(outer, { rotation: 0 }, 1.2)
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: -80, transformOrigin: '50% 0%', duration: 0.3 }, 0)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 80, transformOrigin: '50% 0%', duration: 0.3 }, 0)
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: 0, duration: 0.3 }, 1)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 0, duration: 0.3 }, 1)
    }

    if (danceName === 'flip') {
      tl.to(bob, { y: -60, duration: 0.3, ease: 'power2.out' }, 0)
      tl.to(bob, { scaleY: -1, duration: 0.001 }, 0.3)
      tl.to(bob, { scaleY: 1, duration: 0.001 }, 0.5)
      tl.to(bob, { y: 0, duration: 0.3, ease: 'bounce.out' }, 0.5)
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: -60, transformOrigin: '50% 0%', duration: 0.15 }, 0)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 60, transformOrigin: '50% 0%', duration: 0.15 }, 0)
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: 0, duration: 0.3 }, 0.6)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 0, duration: 0.3 }, 0.6)
    }

    if (danceName === 'wave') {
      const armRepeat = { yoyo: true, repeat: 5, ease: 'sine.inOut' }
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 70, transformOrigin: '50% 0%', duration: 0.2, ...armRepeat }, 0)
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: -70, transformOrigin: '50% 0%', duration: 0.25, ...armRepeat }, 0.1)
      tl.to(bob, { y: -6, duration: 0.2, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0)
      if (leftLegRef.current) tl.to(leftLegRef.current, { rotation: 10, transformOrigin: '50% 0%', duration: 0.2, yoyo: true, repeat: 5 }, 0)
      if (rightLegRef.current) tl.to(rightLegRef.current, { rotation: -10, transformOrigin: '50% 0%', duration: 0.2, yoyo: true, repeat: 5 }, 0.1)
    }

    if (danceName === 'moonwalk') {
      tl.to(outer, { scaleX: -1, duration: 0.1 }, 0)
      if (leftLegRef.current) tl.to(leftLegRef.current, { rotation: 20, transformOrigin: '50% 0%', duration: 0.3, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0.1)
      if (rightLegRef.current) tl.to(rightLegRef.current, { rotation: -20, transformOrigin: '50% 0%', duration: 0.3, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0.25)
      tl.to(outer, { x: `+=${80}`, duration: 2, ease: 'linear' }, 0.1)
      tl.to(bob, { y: -3, duration: 0.15, yoyo: true, repeat: 9 }, 0.1)
      tl.to(outer, { scaleX: 1, duration: 0.1 }, 2.2)
    }

    if (danceName === 'headbang') {
      tl.to(bob, { rotation: 15, duration: 0.12, yoyo: true, repeat: 11, ease: 'power2.in', transformOrigin: '50% 100%' }, 0)
      if (antennaRef.current) tl.to(antennaRef.current, { attr: { cx: '+=8' }, duration: 0.1, yoyo: true, repeat: 11, ease: 'sine.inOut' }, 0)
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: -40, transformOrigin: '50% 0%', duration: 0.12, yoyo: true, repeat: 11 }, 0)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 40, transformOrigin: '50% 0%', duration: 0.12, yoyo: true, repeat: 11 }, 0)
    }

    if (danceName === 'disco') {
      // Alternate pointing arms + leg kicks
      if (rightArmRef.current) {
        tl.to(rightArmRef.current, { rotation: -70, x: -10, y: -15, transformOrigin: '50% 0%', duration: 0.25 }, 0)
        tl.to(rightArmRef.current, { rotation: 70, x: 10, y: -15, duration: 0.25 }, 0.5)
        tl.to(rightArmRef.current, { rotation: -70, x: -10, y: -15, duration: 0.25 }, 1.0)
        tl.to(rightArmRef.current, { rotation: 70, x: 10, y: -15, duration: 0.25 }, 1.5)
        tl.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.2 }, 2.0)
      }
      if (leftArmRef.current) {
        tl.to(leftArmRef.current, { rotation: 70, x: 10, y: -15, transformOrigin: '50% 0%', duration: 0.25 }, 0.25)
        tl.to(leftArmRef.current, { rotation: -70, x: -10, y: -15, duration: 0.25 }, 0.75)
        tl.to(leftArmRef.current, { rotation: 70, x: 10, y: -15, duration: 0.25 }, 1.25)
        tl.to(leftArmRef.current, { rotation: -70, x: -10, y: -15, duration: 0.25 }, 1.75)
        tl.to(leftArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.2 }, 2.0)
      }
      tl.to(bob, { y: -10, duration: 0.25, yoyo: true, repeat: 7, ease: 'power2.out' }, 0)
      if (leftLegRef.current) tl.to(leftLegRef.current, { rotation: 25, transformOrigin: '50% 0%', duration: 0.25, yoyo: true, repeat: 7 }, 0)
      if (rightLegRef.current) tl.to(rightLegRef.current, { rotation: -25, transformOrigin: '50% 0%', duration: 0.25, yoyo: true, repeat: 7 }, 0.125)
      tl.to(outer, { rotation: 5, duration: 0.25, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 0)
    }
  }, [resetPose, setShowDanceMenu, danceTimelineRef, outerRef, bobRef, mouthRef, leftEyeRef, rightEyeRef, leftArmRef, rightArmRef, leftLegRef, rightLegRef, antennaRef])

  // Excited animation when selected
  useEffect(() => {
    if (selectedTimelineRef.current) {
      selectedTimelineRef.current.kill()
      selectedTimelineRef.current = null
    }
    if (!selected) return

    roamDelayRef.current?.kill()
    if (modeTimelineRef.current) {
      modeTimelineRef.current.kill()
      modeTimelineRef.current = null
    }
    stopWalking()

    const tl = gsap.timeline({ repeat: -1 })
    selectedTimelineRef.current = tl

    tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), { attr: { r: 10 }, scaleY: 1, transformOrigin: '50% 50%', duration: 0.2 }, 0)
    tl.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), { attr: { r: 5 }, duration: 0.2 }, 0)
    if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 30 66 Q 40 78 50 66' }, duration: 0.2 }, 0)
    if (bobRef.current) {
      tl.to(bobRef.current, { y: -12, duration: 0.3, ease: 'power2.out' }, 0)
      tl.to(bobRef.current, { y: 0, duration: 0.3, ease: 'bounce.out' }, 0.3)
    }
    if (rightArmRef.current) {
      tl.to(rightArmRef.current, { rotation: 50, transformOrigin: '50% 0%', duration: 0.2 }, 0)
      tl.to(rightArmRef.current, { rotation: 30, duration: 0.15, yoyo: true, repeat: 3 }, 0.2)
      tl.to(rightArmRef.current, { rotation: 50, duration: 0.15 }, 0.8)
    }
    if (antennaRef.current) {
      tl.to(antennaRef.current, { attr: { cx: '+=5' }, duration: 0.15, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0)
    }

    return () => {
      if (selectedTimelineRef.current) {
        selectedTimelineRef.current.kill()
        selectedTimelineRef.current = null
      }
    }
  }, [selected, stopWalking, selectedTimelineRef, roamDelayRef, modeTimelineRef, leftEyeRef, rightEyeRef, leftPupilRef, rightPupilRef, mouthRef, bobRef, rightArmRef, antennaRef])

  // Persistent animations: bob, blink, antenna
  useEffect(() => {
    const bob = bobRef.current
    if (!bob) return

    const ctx = gsap.context(() => {
      gsap.to(bob, { y: -8, duration: 2.5, ease: 'sine.inOut', yoyo: true, repeat: -1 })

      if (antennaRef.current) {
        gsap.to(antennaRef.current, { attr: { cx: '+=3' }, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1 })
      }

      const scheduleBlink = () => {
        const delay = 3 + Math.random() * 4
        gsap.delayedCall(delay, () => {
          const eyes = [leftEyeRef.current, rightEyeRef.current, leftPupilRef.current, rightPupilRef.current].filter(Boolean)
          if (eyes.length === 0) return
          gsap.to(eyes, { scaleY: 0.1, duration: 0.1, transformOrigin: 'center center', yoyo: true, repeat: 1, onComplete: scheduleBlink })
        })
      }
      scheduleBlink()

      const handleVisibility = () => {
        if (document.hidden) gsap.globalTimeline.pause()
        else gsap.globalTimeline.resume()
      }
      document.addEventListener('visibilitychange', handleVisibility)
      return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, bob)

    return () => ctx.revert()
  }, [bobRef, antennaRef, leftEyeRef, rightEyeRef, leftPupilRef, rightPupilRef])

  // Mode-change handler: walk first, then animate
  useEffect(() => {
    if (selectedRef.current || followCursorRef.current) return

    if (modeTimelineRef.current) {
      modeTimelineRef.current.kill()
      modeTimelineRef.current = null
    }
    roamDelayRef.current?.kill()

    const container = containerRef.current
    if (!container) return

    if (mode === 'idle') {
      resetPose()
      const roam = () => {
        if (modeRef.current !== 'idle' || selectedRef.current || followCursorRef.current) return
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
      roamDelayRef.current = gsap.delayedCall(1, roam)
      return
    }

    const bounds = container.getBoundingClientRect()
    const targetX = bounds.width / 2 - 40
    const targetY = bounds.height - 140

    if (mode === 'celebrating' || mode === 'confused') {
      startMoodAnimation(mode)
      return
    }

    walkTo(targetX, targetY, () => {
      startMoodAnimation(mode)
    })
  }, [mode, containerRef, walkTo, resetPose, startMoodAnimation, selectedRef, followCursorRef, modeTimelineRef, roamDelayRef, modeRef])

  return { resetPose, startMoodAnimation, playDance }
}
