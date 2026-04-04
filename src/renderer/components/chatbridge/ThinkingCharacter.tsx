import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export type CharacterMode = 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'celebrating' | 'confused'

interface ThinkingCharacterProps {
  mode: CharacterMode
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function ThinkingCharacter({ mode, containerRef }: ThinkingCharacterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
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

  // Keep modeRef in sync with mode prop
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const ctx = gsap.context(() => {
      // Gentle floating bob
      gsap.to(wrapper, {
        y: -10,
        duration: 2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })

      // Antenna wobble
      if (antennaRef.current) {
        gsap.to(antennaRef.current, {
          attr: { cx: '+=3' },
          duration: 1.5,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      }

      // Periodic blink
      const scheduleBlink = () => {
        const delay = 3 + Math.random() * 4 // 3-7 seconds
        gsap.delayedCall(delay, () => {
          const eyesAndPupils = [leftEyeRef.current, rightEyeRef.current, leftPupilRef.current, rightPupilRef.current].filter(Boolean)
          gsap.to(eyesAndPupils, {
            scaleY: 0.1,
            duration: 0.08,
            transformOrigin: 'center center',
            yoyo: true,
            repeat: 1,
            onComplete: () => scheduleBlink(),
          })
        })
      }
      scheduleBlink()

      // Roaming behavior — start after 1 second
      const roam = () => {
        if (modeRef.current !== 'idle') {
          gsap.delayedCall(1, roam)
          return
        }

        const container = containerRef.current
        if (!container) {
          gsap.delayedCall(1, roam)
          return
        }

        const maxX = Math.max(0, container.offsetWidth - 100)
        const maxY = Math.max(0, container.offsetHeight - 120)
        const targetX = Math.random() * maxX
        const targetY = Math.random() * maxY
        const duration = 2 + Math.random() * 2 // 2-4 seconds

        // Get current x to determine direction
        const currentTransform = gsap.getProperty(wrapper, 'x') as number
        const facingLeft = targetX < currentTransform

        gsap.to(wrapper, {
          x: targetX,
          y: `+=${0}`, // preserve float offset; bob handles y separately via its own tween
          scaleX: facingLeft ? -1 : 1,
          duration,
          ease: 'power2.inOut',
          onComplete: () => {
            // Wait 2-3 seconds then roam again
            const waitTime = 2 + Math.random() * 1
            gsap.delayedCall(waitTime, roam)
          },
        })
      }

      gsap.delayedCall(1, roam)
    }, wrapper)

    return () => ctx.revert()
  }, [containerRef])

  // Mode-change animations
  useEffect(() => {
    // Kill previous mode timeline
    if (modeTimelineRef.current) {
      modeTimelineRef.current.kill()
      modeTimelineRef.current = null
    }

    const wrapper = wrapperRef.current
    const container = containerRef.current
    if (!wrapper || !container) return

    if (mode === 'thinking') {
      // Move to bottom center
      const bounds = container.getBoundingClientRect()
      gsap.to(wrapper, { x: bounds.width / 2 - 40, y: bounds.height - 140, duration: 1, ease: 'power2.out', opacity: 1 })

      const tl = gsap.timeline({ repeat: -1 })
      modeTimelineRef.current = tl

      // Pupils look up-right
      tl.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), {
        attr: { cy: 49, cx: '+=2' }, duration: 0.5, ease: 'power2.out',
      }, 0)

      // Mouth goes flat
      if (mouthRef.current) {
        tl.to(mouthRef.current, { attr: { d: 'M 33 68 Q 40 68 47 68' }, duration: 0.3 }, 0)
      }

      // Right arm to chin
      if (rightArmRef.current) {
        tl.to(rightArmRef.current, { rotation: -45, transformOrigin: '50% 0%', x: -8, y: -5, duration: 0.5, ease: 'power2.out' }, 0)
      }

      // Thought dots
      if (thoughtDotsRef.current) {
        tl.to(thoughtDotsRef.current, { opacity: 1, duration: 0.3 }, 0.3)
        tl.to(thoughtDotsRef.current.children, {
          y: -3, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.15,
        }, 0.5)
      }
    }

    if (mode === 'idle') {
      // Reset everything to default
      gsap.to(wrapper, { opacity: 0.5, rotation: 0, duration: 0.3 })
      gsap.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), {
        attr: { cy: 52 }, duration: 0.3,
      })
      // Reset left pupil cx
      if (leftPupilRef.current) gsap.to(leftPupilRef.current, { attr: { cx: 32 }, duration: 0.3 })
      if (rightPupilRef.current) gsap.to(rightPupilRef.current, { attr: { cx: 52 }, duration: 0.3 })
      gsap.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), { scaleY: 1, attr: { r: 8 }, duration: 0.3 })
      if (mouthRef.current) gsap.to(mouthRef.current, { attr: { d: 'M 32 68 Q 40 74 48 68' }, duration: 0.3 })
      if (rightArmRef.current) gsap.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 })
      if (leftArmRef.current) gsap.to(leftArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 })
      if (thoughtDotsRef.current) gsap.to(thoughtDotsRef.current, { opacity: 0, duration: 0.2 })
    }

    if (mode === 'tool_executing') {
      const bounds = container.getBoundingClientRect()
      gsap.to(wrapper, { x: bounds.width / 2 - 40, y: bounds.height - 140, duration: 0.8, ease: 'power2.out', opacity: 1 })

      const tl = gsap.timeline({ repeat: -1 })
      modeTimelineRef.current = tl

      // Focused eyes
      tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), { scaleY: 0.7, transformOrigin: '50% 50%', duration: 0.3 }, 0)

      // Arms busy
      if (leftArmRef.current) tl.to(leftArmRef.current, { rotation: -20, transformOrigin: '50% 0%', duration: 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0)
      if (rightArmRef.current) tl.to(rightArmRef.current, { rotation: 20, transformOrigin: '50% 0%', duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0)

      // Determined mouth
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 34 68 Q 40 66 46 68' }, duration: 0.3 }, 0)
    }

    if (mode === 'streaming') {
      const bounds = container.getBoundingClientRect()
      gsap.to(wrapper, { x: bounds.width / 2 - 40, y: bounds.height - 140, duration: 0.8, ease: 'power2.out', opacity: 1 })

      const tl = gsap.timeline({ repeat: -1 })
      modeTimelineRef.current = tl

      // Eyes looking down
      tl.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), { attr: { cy: 55 }, duration: 0.5, ease: 'power2.out' }, 0)

      // Reset pupils cx
      if (leftPupilRef.current) tl.to(leftPupilRef.current, { attr: { cx: 32 }, duration: 0.3 }, 0)
      if (rightPupilRef.current) tl.to(rightPupilRef.current, { attr: { cx: 52 }, duration: 0.3 }, 0)

      // Smile
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 32 68 Q 40 74 48 68' }, duration: 0.3 }, 0)

      // Gentle nodding
      tl.to(wrapper, { rotation: 3, duration: 0.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0)
    }

    if (mode === 'celebrating') {
      gsap.to(wrapper, { opacity: 1, duration: 0.2 })

      const tl = gsap.timeline({ repeat: 2 })
      modeTimelineRef.current = tl

      // Big smile
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 30 66 Q 40 80 50 66' }, duration: 0.2 }, 0)

      // Happy squint
      tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), { scaleY: 0.3, transformOrigin: '50% 50%', duration: 0.2 }, 0)

      // Jump
      tl.to(wrapper, { y: '-=30', duration: 0.3, ease: 'power2.out' }, 0)
      tl.to(wrapper, { y: '+=30', duration: 0.3, ease: 'bounce.out' }, 0.3)

      // Wave arms
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

    if (mode === 'confused') {
      gsap.to(wrapper, { opacity: 1, duration: 0.2 })

      const tl = gsap.timeline({ repeat: 2 })
      modeTimelineRef.current = tl

      // Squiggly mouth
      if (mouthRef.current) tl.to(mouthRef.current, { attr: { d: 'M 32 70 Q 36 66 40 70 Q 44 74 48 70' }, duration: 0.3 }, 0)

      // Uneven eyes
      if (leftEyeRef.current) tl.to(leftEyeRef.current, { attr: { r: 6 }, duration: 0.3 }, 0)
      if (rightEyeRef.current) tl.to(rightEyeRef.current, { attr: { r: 9 }, duration: 0.3 }, 0)

      // Scratch head
      if (rightArmRef.current) {
        tl.to(rightArmRef.current, { rotation: -70, x: -15, y: -20, transformOrigin: '50% 0%', duration: 0.4 }, 0)
        tl.to(rightArmRef.current, { rotation: -60, duration: 0.2, yoyo: true, repeat: 3 }, 0.4)
        tl.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 }, 1)
      }

      // Slight tilt
      tl.to(wrapper, { rotation: -8, duration: 0.3, ease: 'power2.out' }, 0)
      tl.to(wrapper, { rotation: 0, duration: 0.3 }, 1)
    }
  }, [mode, containerRef])

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 10,
        willChange: 'transform',
        opacity: mode === 'idle' ? 0.5 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      <svg viewBox="0 0 80 100" width="80" height="100">
        <defs>
          <linearGradient id="bodyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#228be6" />
            <stop offset="100%" stopColor="#1c7ed6" />
          </linearGradient>
        </defs>
        {/* Body */}
        <ellipse ref={bodyRef} cx="40" cy="60" rx="25" ry="28" fill="url(#bodyGradient)" />
        {/* Eyes (whites) */}
        <circle ref={leftEyeRef} cx="30" cy="52" r="8" fill="white" />
        <circle ref={rightEyeRef} cx="50" cy="52" r="8" fill="white" />
        {/* Pupils */}
        <circle ref={leftPupilRef} cx="32" cy="52" r="4" fill="#1a1a2e" />
        <circle ref={rightPupilRef} cx="52" cy="52" r="4" fill="#1a1a2e" />
        {/* Mouth */}
        <path ref={mouthRef} d="M 32 68 Q 40 74 48 68" stroke="#1a1a2e" fill="none" strokeWidth="2" strokeLinecap="round" />
        {/* Arms */}
        <rect ref={leftArmRef} x="12" y="55" width="6" height="16" rx="3" fill="#1c7ed6" />
        <rect ref={rightArmRef} x="62" y="55" width="6" height="16" rx="3" fill="#1c7ed6" />
        {/* Legs */}
        <rect ref={leftLegRef} x="28" y="84" width="6" height="12" rx="3" fill="#1c7ed6" />
        <rect ref={rightLegRef} x="46" y="84" width="6" height="12" rx="3" fill="#1c7ed6" />
        {/* Antenna stem */}
        <line x1="40" y1="32" x2="40" y2="22" stroke="#228be6" strokeWidth="2" />
        {/* Antenna tip */}
        <circle ref={antennaRef} cx="40" cy="20" r="4" fill="#228be6" />
        {/* Thought dots (hidden by default) */}
        <g ref={thoughtDotsRef} opacity="0">
          <circle cx="58" cy="30" r="3" fill="#adb5bd" />
          <circle cx="65" cy="22" r="4" fill="#adb5bd" />
          <circle cx="74" cy="14" r="5" fill="#adb5bd" />
        </g>
      </svg>
    </div>
  )
}
