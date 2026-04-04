import { useEffect, useRef, useCallback, useState } from 'react'
import gsap from 'gsap'

export type CharacterMode = 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'celebrating' | 'confused'

interface ThinkingCharacterProps {
  mode: CharacterMode
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function ThinkingCharacter({ mode, containerRef }: ThinkingCharacterProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const bobRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<SVGEllipseElement>(null)
  const leftEyeRef = useRef<SVGCircleElement>(null)
  const rightEyeRef = useRef<SVGCircleElement>(null)
  const leftPupilRef = useRef<SVGCircleElement>(null)
  const rightPupilRef = useRef<SVGCircleElement>(null)
  const mouthRef = useRef<SVGPathElement>(null)
  const leftArmRef = useRef<SVGRectElement>(null)
  const rightArmRef = useRef<SVGRectElement>(null)
  const leftLegRef = useRef<SVGRectElement>(null)
  const rightLegRef = useRef<SVGRectElement>(null)
  const antennaRef = useRef<SVGCircleElement>(null)
  const thoughtDotsRef = useRef<SVGGElement>(null)
  const modeRef = useRef<CharacterMode>(mode)
  const modeTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const walkTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const roamDelayRef = useRef<gsap.core.Tween | null>(null)
  const selectedTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const [selected, setSelected] = useState(false)
  const selectedRef = useRef(false)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, elX: 0, elY: 0 })

  // Sync refs
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { selectedRef.current = selected }, [selected])

  // ===== ALL useCallback DEFINITIONS FIRST (before any useEffect that references them) =====

  const createWalkAnimation = useCallback(() => {
    const tl = gsap.timeline({ repeat: -1 })
    if (leftLegRef.current && rightLegRef.current) {
      tl.to(leftLegRef.current, { rotation: 15, transformOrigin: '50% 0%', duration: 0.2, ease: 'sine.inOut' }, 0)
      tl.to(rightLegRef.current, { rotation: -15, transformOrigin: '50% 0%', duration: 0.2, ease: 'sine.inOut' }, 0)
      tl.to(leftLegRef.current, { rotation: -15, duration: 0.2, ease: 'sine.inOut' }, 0.2)
      tl.to(rightLegRef.current, { rotation: 15, duration: 0.2, ease: 'sine.inOut' }, 0.2)
    }
    return tl
  }, [])

  const stopWalking = useCallback(() => {
    if (walkTimelineRef.current) {
      walkTimelineRef.current.kill()
      walkTimelineRef.current = null
    }
    if (leftLegRef.current) gsap.to(leftLegRef.current, { rotation: 0, duration: 0.15 })
    if (rightLegRef.current) gsap.to(rightLegRef.current, { rotation: 0, duration: 0.15 })
  }, [])

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
  }, [createWalkAnimation, stopWalking])

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
  }, [])

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
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const outer = outerRef.current
    if (!outer) return

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

    const handleMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !outer) return
      const dx = ev.clientX - dragStartRef.current.mouseX
      const dy = ev.clientY - dragStartRef.current.mouseY
      gsap.set(outer, {
        x: dragStartRef.current.elX + dx,
        y: dragStartRef.current.elY + dy,
      })
    }

    const handleMouseUp = () => {
      draggingRef.current = false
      setSelected(false)
      resetPose()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [stopWalking, resetPose])

  // ===== ALL useEffect HOOKS BELOW =====

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
  }, [selected, stopWalking])

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
  }, [])

  // Roaming (idle only)
  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return

    const roam = () => {
      if (modeRef.current !== 'idle' || selectedRef.current) return
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
  }, [containerRef, walkTo])

  // Mode-change handler: walk first, then animate
  useEffect(() => {
    if (selectedRef.current) return

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
        if (modeRef.current !== 'idle' || selectedRef.current) return
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
  }, [mode, containerRef, walkTo, resetPose, startMoodAnimation])

  return (
    <div
      ref={outerRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'auto',
        zIndex: 10,
        willChange: 'transform',
        opacity: selected ? 1 : mode === 'idle' ? 0.5 : 1,
        transition: 'opacity 0.3s ease',
        cursor: selected ? 'grab' : 'pointer',
        filter: selected ? 'drop-shadow(0 0 8px rgba(34, 139, 230, 0.8))' : 'none',
      }}
    >
      <div ref={bobRef}>
        <svg viewBox="0 0 80 100" width="80" height="100">
          <defs>
            <linearGradient id="bodyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#228be6" />
              <stop offset="100%" stopColor="#1c7ed6" />
            </linearGradient>
          </defs>
          <ellipse ref={bodyRef} cx="40" cy="60" rx="25" ry="28" fill="url(#bodyGradient)" />
          <circle ref={leftEyeRef} cx="30" cy="52" r="8" fill="white" />
          <circle ref={rightEyeRef} cx="50" cy="52" r="8" fill="white" />
          <circle ref={leftPupilRef} cx="32" cy="52" r="4" fill="#1a1a2e" />
          <circle ref={rightPupilRef} cx="52" cy="52" r="4" fill="#1a1a2e" />
          <path ref={mouthRef} d="M 32 68 Q 40 74 48 68" stroke="#1a1a2e" fill="none" strokeWidth="2" strokeLinecap="round" />
          <rect ref={leftArmRef} x="12" y="55" width="6" height="16" rx="3" fill="#1c7ed6" />
          <rect ref={rightArmRef} x="62" y="55" width="6" height="16" rx="3" fill="#1c7ed6" />
          <rect ref={leftLegRef} x="28" y="84" width="6" height="12" rx="3" fill="#1c7ed6" />
          <rect ref={rightLegRef} x="46" y="84" width="6" height="12" rx="3" fill="#1c7ed6" />
          <line x1="40" y1="32" x2="40" y2="22" stroke="#228be6" strokeWidth="2" />
          <circle ref={antennaRef} cx="40" cy="20" r="4" fill="#228be6" />
          <g ref={thoughtDotsRef} opacity="0">
            <circle cx="58" cy="30" r="3" fill="#adb5bd" />
            <circle cx="65" cy="22" r="4" fill="#adb5bd" />
            <circle cx="74" cy="14" r="5" fill="#adb5bd" />
          </g>
        </svg>
      </div>
    </div>
  )
}
