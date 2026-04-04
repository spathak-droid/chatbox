import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export type CharacterMode = 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'celebrating' | 'confused'

interface ThinkingCharacterProps {
  mode: CharacterMode
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function ThinkingCharacter({ mode, containerRef }: ThinkingCharacterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const leftEyeRef = useRef<SVGCircleElement>(null)
  const rightEyeRef = useRef<SVGCircleElement>(null)
  const antennaRef = useRef<SVGCircleElement>(null)
  const thoughtDotsRef = useRef<SVGGElement>(null)
  const modeRef = useRef<CharacterMode>(mode)

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
          const eyes = [leftEyeRef.current, rightEyeRef.current].filter(Boolean)
          gsap.to(eyes, {
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
        <ellipse cx="40" cy="60" rx="25" ry="28" fill="url(#bodyGradient)" />
        {/* Eyes (whites) */}
        <circle ref={leftEyeRef} cx="30" cy="52" r="8" fill="white" />
        <circle ref={rightEyeRef} cx="50" cy="52" r="8" fill="white" />
        {/* Pupils */}
        <circle cx="32" cy="52" r="4" fill="#1a1a2e" />
        <circle cx="52" cy="52" r="4" fill="#1a1a2e" />
        {/* Mouth */}
        <path d="M 32 68 Q 40 74 48 68" stroke="#1a1a2e" fill="none" strokeWidth="2" strokeLinecap="round" />
        {/* Arms */}
        <rect x="12" y="55" width="6" height="16" rx="3" fill="#1c7ed6" />
        <rect x="62" y="55" width="6" height="16" rx="3" fill="#1c7ed6" />
        {/* Legs */}
        <rect x="28" y="84" width="6" height="12" rx="3" fill="#1c7ed6" />
        <rect x="46" y="84" width="6" height="12" rx="3" fill="#1c7ed6" />
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
