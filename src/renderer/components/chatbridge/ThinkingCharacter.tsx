import { useEffect, useRef, useCallback, useState } from 'react'
import gsap from 'gsap'
import type { CharacterMode } from './types'
import { useCharacterMovement } from './hooks/useCharacterMovement'
import { useCharacterAnimation } from './hooks/useCharacterAnimation'
import { useCharacterDrag } from './hooks/useCharacterDrag'

export type { CharacterMode }

interface ThinkingCharacterProps {
  mode: CharacterMode
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function ThinkingCharacter({ mode, containerRef }: ThinkingCharacterProps) {
  // ===== SVG element refs =====
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

  // ===== Animation timeline refs =====
  const modeTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const walkTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const roamDelayRef = useRef<gsap.core.Tween | null>(null)
  const selectedTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const danceTimelineRef = useRef<gsap.core.Timeline | null>(null)

  // ===== State =====
  const [selected, setSelected] = useState(false)
  const [followCursor, setFollowCursor] = useState(false)
  const [showDanceMenu, setShowDanceMenu] = useState(false)
  const [hovered, setHovered] = useState(false)

  // ===== Synced refs (stable references for animation callbacks) =====
  const modeRef = useRef<CharacterMode>(mode)
  const selectedRef = useRef(false)
  const followCursorRef = useRef(false)
  const mousePositionRef = useRef({ x: 0, y: 0 })
  const followRafRef = useRef<number | null>(null)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { followCursorRef.current = followCursor }, [followCursor])

  // ===== Hooks =====

  // Animation hook provides resetPose, startMoodAnimation, playDance
  // Movement hook provides walkTo, stopWalking, createWalkAnimation
  // Both need each other, so we wire them with a two-pass approach:
  // 1. Movement first (no dependency on animation)
  // 2. Animation uses walkTo/stopWalking from movement

  // We need resetPose before movement (follow cursor cleanup uses it),
  // but resetPose doesn't depend on movement, so we extract it via animation hook.
  // The circular dependency is: movement.followCursor cleanup calls resetPose,
  // and animation.modeChange calls walkTo. We break the cycle by passing
  // resetPose into movement params.

  const { resetPose, startMoodAnimation, playDance } = useCharacterAnimation({
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
    // These will be provided after movement hook, but since they're used in useEffects
    // (not called during render), they'll be available by the time they're needed.
    // We use a stable callback wrapper to avoid the chicken-and-egg problem.
    walkTo: (...args: Parameters<typeof walkToRef.current>) => walkToRef.current(...args),
    stopWalking: () => stopWalkingRef.current(),
    setShowDanceMenu,
  })

  // Stable refs for the cross-hook dependency
  const walkToRef = useRef<(targetX: number, targetY: number, onArrive: () => void) => void>(() => {})
  const stopWalkingRef = useRef<() => void>(() => {})

  const { walkTo, stopWalking, createWalkAnimation } = useCharacterMovement({
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
  })

  // Keep stable refs updated
  useEffect(() => { walkToRef.current = walkTo }, [walkTo])
  useEffect(() => { stopWalkingRef.current = stopWalking }, [stopWalking])

  const { handleMouseDown } = useCharacterDrag({
    outerRef,
    roamDelayRef,
    walkTimelineRef,
    selectedRef,
    stopWalking,
    resetPose,
    showDanceMenu,
    setShowDanceMenu,
    setSelected,
  })

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFollowCursor(prev => !prev)
  }, [])

  // ===== Render =====
  return (
    <div
      ref={outerRef}
      onMouseDown={followCursor ? undefined : handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'auto',
        zIndex: 10,
        willChange: 'transform',
        opacity: selected || followCursor ? 1 : mode === 'idle' ? 0.5 : 1,
        transition: 'opacity 0.3s ease, filter 0.3s ease',
        cursor: followCursor ? 'none' : selected ? 'grab' : 'pointer',
        filter: followCursor ? 'drop-shadow(0 0 12px rgba(34, 230, 130, 0.8))' : selected ? 'drop-shadow(0 0 8px rgba(34, 139, 230, 0.8))' : 'none',
      }}
    >
      {/* Hint tooltip on hover */}
      {hovered && !showDanceMenu && !selected && !followCursor && (
        <div style={{
          position: 'absolute',
          bottom: '108px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(20, 20, 35, 0.9)',
          borderRadius: 8,
          padding: '5px 10px',
          whiteSpace: 'nowrap',
          fontSize: 11,
          color: '#adb5bd',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none',
          zIndex: 20,
        }}>
          <span style={{ color: '#74c0fc' }}>Hold</span> to dance &middot; <span style={{ color: '#74c0fc' }}>Double-click</span> to follow
        </div>
      )}

      {/* Dance moves menu */}
      {showDanceMenu && (
        <div
          style={{
            position: 'absolute',
            bottom: '105px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20, 20, 35, 0.95)',
            borderRadius: 12,
            padding: '8px 4px',
            display: 'flex',
            gap: 4,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 15px rgba(34, 139, 230, 0.3)',
            border: '1px solid rgba(34, 139, 230, 0.3)',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {[
            { id: 'spin', emoji: '\uD83C\uDF00' },
            { id: 'flip', emoji: '\uD83E\uDD38' },
            { id: 'wave', emoji: '\uD83D\uDC4B' },
            { id: 'moonwalk', emoji: '\uD83D\uDD7A' },
            { id: 'headbang', emoji: '\uD83E\uDDD1\u200D\uD83C\uDFA4' },
            { id: 'disco', emoji: '\uD83D\uDD7A' },
          ].map((dance) => (
            <button
              key={dance.id}
              onClick={(e) => {
                e.stopPropagation()
                setSelected(false)
                playDance(dance.id)
              }}
              title={dance.id}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 8,
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(34, 139, 230, 0.25)' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent' }}
            >
              {dance.emoji}
            </button>
          ))}
        </div>
      )}

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
