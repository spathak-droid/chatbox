# Thinking Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible animated SVG character to the chat area that reacts to app events (thinking, tool calls, streaming, game results) and roams freely when idle.

**Architecture:** A single new React component (`ThinkingCharacter.tsx`) rendered inside the chat ScrollArea. The parent (`ChatBridgeChat.tsx`) derives a `mode` prop from existing state variables and passes it down. GSAP handles all animations. The character is absolutely positioned over chat content.

**Tech Stack:** React, GSAP, inline SVG

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/components/chatbridge/ThinkingCharacter.tsx` | Create | SVG character, GSAP animations, roaming logic, mood state machine |
| `src/renderer/components/chatbridge/ChatBridgeChat.tsx` | Modify | Derive `characterMode`, add `streaming` state, render `<ThinkingCharacter>`, add ref to chat container |

---

### Task 1: Install GSAP dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install gsap**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && pnpm add gsap
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && node -e "require('gsap'); console.log('gsap OK')"
```

Expected: `gsap OK`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add gsap dependency for chat character animation"
```

---

### Task 2: Create ThinkingCharacter SVG component (static, no animation)

**Files:**
- Create: `src/renderer/components/chatbridge/ThinkingCharacter.tsx`

- [ ] **Step 1: Create the component with inline SVG and all body parts as refs**

Create `src/renderer/components/chatbridge/ThinkingCharacter.tsx`:

```tsx
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
  const leftPupilRef = useRef<SVGCircleElement>(null)
  const rightPupilRef = useRef<SVGCircleElement>(null)
  const leftEyeRef = useRef<SVGCircleElement>(null)
  const rightEyeRef = useRef<SVGCircleElement>(null)
  const mouthRef = useRef<SVGPathElement>(null)
  const leftArmRef = useRef<SVGRectElement>(null)
  const rightArmRef = useRef<SVGRectElement>(null)
  const leftLegRef = useRef<SVGRectElement>(null)
  const rightLegRef = useRef<SVGRectElement>(null)
  const antennaRef = useRef<SVGCircleElement>(null)
  const thoughtDotsRef = useRef<SVGGElement>(null)

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        bottom: 80,
        left: 20,
        width: 80,
        height: 100,
        pointerEvents: 'none',
        zIndex: 10,
        opacity: mode === 'idle' ? 0.5 : 1,
        willChange: 'transform',
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

        {/* Eyes - white sclera */}
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

        {/* Antenna */}
        <line x1="40" y1="32" x2="40" y2="22" stroke="#228be6" strokeWidth="2" />
        <circle ref={antennaRef} cx="40" cy="20" r="4" fill="#228be6" />

        {/* Thought dots - hidden by default */}
        <g ref={thoughtDotsRef} opacity="0">
          <circle cx="58" cy="30" r="3" fill="#adb5bd" />
          <circle cx="65" cy="22" r="4" fill="#adb5bd" />
          <circle cx="74" cy="14" r="5" fill="#adb5bd" />
        </g>
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Render it in ChatBridgeChat to verify it shows up**

In `src/renderer/components/chatbridge/ChatBridgeChat.tsx`, add the import at the top:

```tsx
import { ThinkingCharacter, type CharacterMode } from './ThinkingCharacter'
```

Add a ref for the chat container. Find the `{/* Messages */}` ScrollArea section (around line 818):

```tsx
<ScrollArea style={{ flex: 1 }} viewportRef={viewportRef} p="md">
```

Wrap the ScrollArea content in a `div` with `position: relative` and a ref, and add the character. Change the ScrollArea block to:

```tsx
<ScrollArea style={{ flex: 1 }} viewportRef={viewportRef} p="md">
  <div ref={chatContainerRef} style={{ position: 'relative', minHeight: '100%' }}>
    <Stack gap="md" maw={600} mx="auto" pb="xl">
      {/* ... existing messages, empty state, loading indicator ... */}
    </Stack>
    <ThinkingCharacter mode="idle" containerRef={chatContainerRef} />
  </div>
</ScrollArea>
```

Add the ref declaration near the other refs (around line 113-115):

```tsx
const chatContainerRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 3: Build and verify the character renders**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && source ~/.nvm/nvm.sh && nvm use 22 && CHATBOX_BUILD_PLATFORM=web npx electron-vite build 2>&1 | tail -5
```

Kill the old frontend server and restart:

```bash
kill -9 $(lsof -ti:1212) 2>/dev/null; sleep 1; npx serve ./release/app/dist/renderer -l 1212 -s &
```

Open http://localhost:1212, hard refresh. Verify a blue blob character appears in the bottom-left of the chat area.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/chatbridge/ThinkingCharacter.tsx src/renderer/components/chatbridge/ChatBridgeChat.tsx
git commit -m "feat: add static ThinkingCharacter SVG to chat area"
```

---

### Task 3: Add idle animation (floating bob + blink)

**Files:**
- Modify: `src/renderer/components/chatbridge/ThinkingCharacter.tsx`

- [ ] **Step 1: Add GSAP idle animation with floating bob and periodic blink**

In `ThinkingCharacter.tsx`, add a `useEffect` that creates the idle animation. Place this after the ref declarations and before the return:

```tsx
useEffect(() => {
  const ctx = gsap.context(() => {
    if (!wrapperRef.current) return

    // Gentle floating bob
    gsap.to(wrapperRef.current, {
      y: -10,
      duration: 2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })

    // Antenna wobble
    if (antennaRef.current) {
      gsap.to(antennaRef.current, {
        cx: '+=3',
        duration: 1.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })
    }

    // Periodic blink — squash eyes vertically
    const blink = () => {
      const delay = 3 + Math.random() * 4 // 3-7 seconds between blinks
      gsap.delayedCall(delay, () => {
        const eyes = [leftEyeRef.current, rightEyeRef.current, leftPupilRef.current, rightPupilRef.current].filter(Boolean)
        const tl = gsap.timeline()
        tl.to(eyes, { scaleY: 0.1, transformOrigin: '50% 50%', duration: 0.08, ease: 'power2.in' })
        tl.to(eyes, { scaleY: 1, duration: 0.08, ease: 'power2.out' })
        tl.call(blink)
      })
    }
    blink()
  })

  return () => ctx.revert()
}, [])
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && source ~/.nvm/nvm.sh && nvm use 22 && CHATBOX_BUILD_PLATFORM=web npx electron-vite build 2>&1 | tail -5
```

Restart frontend, hard refresh. Verify the character gently bobs up and down, antenna wobbles, and eyes blink every few seconds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/chatbridge/ThinkingCharacter.tsx
git commit -m "feat: add idle floating bob and blink animation to character"
```

---

### Task 4: Add roaming behavior (idle mode walks around chat area)

**Files:**
- Modify: `src/renderer/components/chatbridge/ThinkingCharacter.tsx`

- [ ] **Step 1: Add roaming logic that picks random positions within the container**

Replace the idle `useEffect` from Task 3 with a full mode-aware effect. This new effect handles idle roaming and will be extended for other modes in later tasks. Replace the entire `useEffect` block:

```tsx
// Track mode ref for use in callbacks
const modeRef = useRef(mode)
modeRef.current = mode

useEffect(() => {
  const wrapper = wrapperRef.current
  const container = containerRef.current
  if (!wrapper || !container) return

  const ctx = gsap.context(() => {
    // Gentle floating bob — always active
    gsap.to(wrapper, {
      y: -10,
      duration: 2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })

    // Antenna wobble — always active
    if (antennaRef.current) {
      gsap.to(antennaRef.current, {
        cx: '+=3',
        duration: 1.5,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      })
    }

    // Periodic blink
    const blink = () => {
      const delay = 3 + Math.random() * 4
      gsap.delayedCall(delay, () => {
        if (!wrapperRef.current) return
        const eyes = [leftEyeRef.current, rightEyeRef.current, leftPupilRef.current, rightPupilRef.current].filter(Boolean)
        const tl = gsap.timeline()
        tl.to(eyes, { scaleY: 0.1, transformOrigin: '50% 50%', duration: 0.08, ease: 'power2.in' })
        tl.to(eyes, { scaleY: 1, duration: 0.08, ease: 'power2.out' })
        tl.call(blink)
      })
    }
    blink()

    // Roaming — pick random positions within container bounds
    const roam = () => {
      if (modeRef.current !== 'idle' || !wrapper || !container) return
      const bounds = container.getBoundingClientRect()
      const maxX = Math.max(0, bounds.width - 100)
      const maxY = Math.max(0, bounds.height - 120)
      const targetX = Math.random() * maxX
      const targetY = Math.random() * maxY

      // Flip character to face direction of movement
      const currentX = gsap.getProperty(wrapper, 'x') as number || 0
      const scaleX = targetX < currentX ? -1 : 1
      gsap.to(wrapper, { scaleX, duration: 0.2 })

      gsap.to(wrapper, {
        x: targetX,
        y: targetY,
        duration: 2 + Math.random() * 2,
        ease: 'power2.inOut',
        onComplete: () => {
          gsap.delayedCall(2 + Math.random() * 3, roam)
        },
      })
    }
    // Start roaming after initial delay
    gsap.delayedCall(1, roam)
  })

  return () => ctx.revert()
}, []) // Mount once — mode changes handled via modeRef
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && source ~/.nvm/nvm.sh && nvm use 22 && CHATBOX_BUILD_PLATFORM=web npx electron-vite build 2>&1 | tail -5
```

Restart frontend, hard refresh. Verify the character wanders to random positions within the chat area every 4-6 seconds, flipping horizontally to face the direction of travel.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/chatbridge/ThinkingCharacter.tsx
git commit -m "feat: add idle roaming behavior to thinking character"
```

---

### Task 5: Add thinking mode animation

**Files:**
- Modify: `src/renderer/components/chatbridge/ThinkingCharacter.tsx`

- [ ] **Step 1: Add a mode-change effect that triggers thinking animation**

Add a second `useEffect` that reacts to `mode` changes. Place it after the first `useEffect`:

```tsx
// Mode-specific animations
const modeTimelineRef = useRef<gsap.core.Timeline | null>(null)

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
    // Move to bottom center of container
    const bounds = container.getBoundingClientRect()
    const targetX = bounds.width / 2 - 40
    const targetY = bounds.height - 140

    gsap.to(wrapper, { x: targetX, y: targetY, duration: 1, ease: 'power2.out', opacity: 1 })

    const tl = gsap.timeline({ repeat: -1 })
    modeTimelineRef.current = tl

    // Pupils look up-right (thinking pose)
    tl.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), {
      cy: 49, cx: '+=2', duration: 0.5, ease: 'power2.out',
    }, 0)

    // Mouth goes flat (pursed)
    if (mouthRef.current) {
      tl.to(mouthRef.current, {
        attr: { d: 'M 33 68 Q 40 68 47 68' },
        duration: 0.3,
      }, 0)
    }

    // Right arm up to chin (thinking pose)
    if (rightArmRef.current) {
      tl.to(rightArmRef.current, {
        rotation: -45, transformOrigin: '50% 0%', x: -8, y: -5,
        duration: 0.5, ease: 'power2.out',
      }, 0)
    }

    // Show thought dots with staggered fade-in
    if (thoughtDotsRef.current) {
      tl.to(thoughtDotsRef.current, { opacity: 1, duration: 0.3 }, 0.3)
      tl.to(thoughtDotsRef.current.children, {
        y: -3, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.15,
      }, 0.5)
    }
  }

  if (mode === 'idle') {
    // Reset all body parts to default positions
    gsap.to(wrapper, { opacity: 0.5, duration: 0.3 })
    gsap.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), {
      cy: 52, cx: (i: number) => i === 0 ? 32 : 52, duration: 0.3,
    })
    if (mouthRef.current) {
      gsap.to(mouthRef.current, { attr: { d: 'M 32 68 Q 40 74 48 68' }, duration: 0.3 })
    }
    if (rightArmRef.current) {
      gsap.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 })
    }
    if (thoughtDotsRef.current) {
      gsap.to(thoughtDotsRef.current, { opacity: 0, duration: 0.2 })
    }
  }
}, [mode])
```

- [ ] **Step 2: Wire up the mode prop in ChatBridgeChat.tsx**

In `ChatBridgeChat.tsx`, derive `characterMode` from existing state. Add this near the other state declarations (after `loading` state around line 108):

```tsx
const [streaming, setStreaming] = useState(false)
const [toolExecuting, setToolExecuting] = useState(false)
const [characterMode, setCharacterMode] = useState<CharacterMode>('idle')
```

Update `characterMode` based on state changes. Add this `useEffect` after the existing state declarations:

```tsx
useEffect(() => {
  if (loading && !streaming && !toolExecuting) {
    setCharacterMode('thinking')
  } else if (toolExecuting) {
    setCharacterMode('tool_executing')
  } else if (streaming) {
    setCharacterMode('streaming')
  } else {
    setCharacterMode('idle')
  }
}, [loading, streaming, toolExecuting])
```

In the `sendMessage` SSE event handler, set streaming/toolExecuting flags. In the `case 'text':` block (around line 303), add before the existing code:

```tsx
case 'text': {
  setStreaming(true)
  setToolExecuting(false)
  // ... existing code
```

In the `case 'tool_call':` block (around line 311), add:

```tsx
case 'tool_call': {
  setToolExecuting(true)
  setStreaming(false)
  // ... existing code
```

In the `case 'tool_result':` block (around line 325), add:

```tsx
case 'tool_result': {
  setToolExecuting(false)
  // ... existing code
```

In the `finally` block of `sendMessage` (around line 428), reset both:

```tsx
} finally {
  setLoading(false)
  setStreaming(false)
  setToolExecuting(false)
}
```

Update the `<ThinkingCharacter>` render to pass `characterMode`:

```tsx
<ThinkingCharacter mode={characterMode} containerRef={chatContainerRef} />
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && source ~/.nvm/nvm.sh && nvm use 22 && CHATBOX_BUILD_PLATFORM=web npx electron-vite build 2>&1 | tail -5
```

Restart frontend, hard refresh. Send a message. Verify:
- Character moves to bottom-center and enters thinking pose (pupils up, arm on chin, thought dots appear)
- When response arrives, character returns to idle (relaxed pose, roaming)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/chatbridge/ThinkingCharacter.tsx src/renderer/components/chatbridge/ChatBridgeChat.tsx
git commit -m "feat: add thinking mode animation with mode derivation in chat"
```

---

### Task 6: Add tool_executing, streaming, celebrating, and confused animations

**Files:**
- Modify: `src/renderer/components/chatbridge/ThinkingCharacter.tsx`
- Modify: `src/renderer/components/chatbridge/ChatBridgeChat.tsx`

- [ ] **Step 1: Add remaining mode animations to ThinkingCharacter.tsx**

Extend the mode-change `useEffect` (the second one) by adding cases after the `if (mode === 'idle')` block:

```tsx
if (mode === 'tool_executing') {
  // Move to bottom-center
  const bounds = container.getBoundingClientRect()
  gsap.to(wrapper, { x: bounds.width / 2 - 40, y: bounds.height - 140, duration: 0.8, ease: 'power2.out', opacity: 1 })

  const tl = gsap.timeline({ repeat: -1 })
  modeTimelineRef.current = tl

  // Focused eyes — slightly narrowed
  tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), {
    scaleY: 0.7, transformOrigin: '50% 50%', duration: 0.3,
  }, 0)

  // Arms moving — busy working
  if (leftArmRef.current) {
    tl.to(leftArmRef.current, { rotation: -20, transformOrigin: '50% 0%', duration: 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0)
  }
  if (rightArmRef.current) {
    tl.to(rightArmRef.current, { rotation: 20, transformOrigin: '50% 0%', duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0)
  }

  // Determined mouth
  if (mouthRef.current) {
    tl.to(mouthRef.current, { attr: { d: 'M 34 68 Q 40 66 46 68' }, duration: 0.3 }, 0)
  }
}

if (mode === 'streaming') {
  const bounds = container.getBoundingClientRect()
  gsap.to(wrapper, { x: bounds.width / 2 - 40, y: bounds.height - 140, duration: 0.8, ease: 'power2.out', opacity: 1 })

  const tl = gsap.timeline({ repeat: -1 })
  modeTimelineRef.current = tl

  // Eyes looking down — following text
  tl.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), {
    cy: 55, duration: 0.5, ease: 'power2.out',
  }, 0)

  // Slight smile
  if (mouthRef.current) {
    tl.to(mouthRef.current, { attr: { d: 'M 32 68 Q 40 74 48 68' }, duration: 0.3 }, 0)
  }

  // Gentle nodding
  tl.to(wrapper, { rotation: 3, duration: 0.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 0)
}

if (mode === 'celebrating') {
  gsap.to(wrapper, { opacity: 1, duration: 0.2 })

  const tl = gsap.timeline({ repeat: 2 })
  modeTimelineRef.current = tl

  // Big smile — wide open mouth
  if (mouthRef.current) {
    tl.to(mouthRef.current, { attr: { d: 'M 30 66 Q 40 80 50 66' }, duration: 0.2 }, 0)
  }

  // Happy squint — eyes become arcs
  tl.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), {
    scaleY: 0.3, transformOrigin: '50% 50%', duration: 0.2,
  }, 0)

  // Jump up and down
  tl.to(wrapper, { y: '-=30', duration: 0.3, ease: 'power2.out' }, 0)
  tl.to(wrapper, { y: '+=30', duration: 0.3, ease: 'bounce.out' }, 0.3)

  // Wave both arms
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

  // After celebration, return to idle
  tl.call(() => {
    // Parent will set mode back to idle via timeout
  })
}

if (mode === 'confused') {
  gsap.to(wrapper, { opacity: 1, duration: 0.2 })

  const tl = gsap.timeline({ repeat: 2 })
  modeTimelineRef.current = tl

  // Squiggly mouth
  if (mouthRef.current) {
    tl.to(mouthRef.current, { attr: { d: 'M 32 70 Q 36 66 40 70 Q 44 74 48 70' }, duration: 0.3 }, 0)
  }

  // Uneven eyes — one bigger than other
  if (leftEyeRef.current) {
    tl.to(leftEyeRef.current, { r: 6, duration: 0.3 }, 0)
  }
  if (rightEyeRef.current) {
    tl.to(rightEyeRef.current, { r: 9, duration: 0.3 }, 0)
  }

  // Scratch head — right arm goes up
  if (rightArmRef.current) {
    tl.to(rightArmRef.current, { rotation: -70, x: -15, y: -20, transformOrigin: '50% 0%', duration: 0.4 }, 0)
    tl.to(rightArmRef.current, { rotation: -60, duration: 0.2, yoyo: true, repeat: 3 }, 0.4)
    tl.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 }, 1)
  }

  // Slight tilt
  tl.to(wrapper, { rotation: -8, duration: 0.3, ease: 'power2.out' }, 0)
  tl.to(wrapper, { rotation: 0, duration: 0.3 }, 1)
}
```

Also update the `idle` reset block to include resetting the additional properties from the new modes:

```tsx
if (mode === 'idle') {
  gsap.to(wrapper, { opacity: 0.5, rotation: 0, duration: 0.3 })
  gsap.to([leftPupilRef.current, rightPupilRef.current].filter(Boolean), {
    cy: 52, cx: (i: number) => i === 0 ? 32 : 52, duration: 0.3,
  })
  gsap.to([leftEyeRef.current, rightEyeRef.current].filter(Boolean), {
    scaleY: 1, r: 8, duration: 0.3,
  })
  if (mouthRef.current) {
    gsap.to(mouthRef.current, { attr: { d: 'M 32 68 Q 40 74 48 68' }, duration: 0.3 })
  }
  if (rightArmRef.current) {
    gsap.to(rightArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 })
  }
  if (leftArmRef.current) {
    gsap.to(leftArmRef.current, { rotation: 0, x: 0, y: 0, duration: 0.3 })
  }
  if (thoughtDotsRef.current) {
    gsap.to(thoughtDotsRef.current, { opacity: 0, duration: 0.2 })
  }
}
```

- [ ] **Step 2: Wire celebrating and confused modes in ChatBridgeChat.tsx**

Update the `handleGameEvent` callback (around line 642) to trigger celebrating mode:

```tsx
const handleGameEvent = useCallback(
  (event: { type: string; detail: Record<string, unknown> }) => {
    if (event.type === 'level_complete' || event.type === 'game_won') {
      fireConfetti()
      setCharacterMode('celebrating')
      setTimeout(() => setCharacterMode('idle'), 3000)
    }
  },
  [fireConfetti]
)
```

In the SSE event handler, trigger confused mode on errors. In the `case 'error':` block (around line 404), add:

```tsx
case 'error': {
  setCharacterMode('confused')
  setTimeout(() => setCharacterMode('idle'), 3000)
  // ... existing error handling code
```

Also trigger celebrating in the `handleGameOver` callback (around line 706):

```tsx
const handleGameOver = useCallback(
  (result: { won: boolean; result?: string }) => {
    if (result.won) {
      fireConfetti()
      setCharacterMode('celebrating')
      setTimeout(() => setCharacterMode('idle'), 3000)
    }
    // ... existing close panel logic
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && source ~/.nvm/nvm.sh && nvm use 22 && CHATBOX_BUILD_PLATFORM=web npx electron-vite build 2>&1 | tail -5
```

Restart frontend, hard refresh. Test each mode:
- Send a message → character thinks, then streams (nodding), then returns to idle
- If tool call happens → character does working animation
- If error → confused animation for 3s
- Idle → roaming around the chat

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/chatbridge/ThinkingCharacter.tsx src/renderer/components/chatbridge/ChatBridgeChat.tsx
git commit -m "feat: add all mood animations (tool_executing, streaming, celebrating, confused)"
```

---

### Task 7: Add visibility pause and remove old Thinking... indicator

**Files:**
- Modify: `src/renderer/components/chatbridge/ThinkingCharacter.tsx`
- Modify: `src/renderer/components/chatbridge/ChatBridgeChat.tsx`

- [ ] **Step 1: Pause GSAP when tab is hidden**

In `ThinkingCharacter.tsx`, add a visibility change handler inside the first `useEffect` (the mount effect), after the `blink()` call:

```tsx
// Pause animations when tab is hidden
const handleVisibility = () => {
  if (document.hidden) {
    gsap.globalTimeline.pause()
  } else {
    gsap.globalTimeline.resume()
  }
}
document.addEventListener('visibilitychange', handleVisibility)
```

And in the cleanup return of that same `useEffect`, add:

```tsx
return () => {
  ctx.revert()
  document.removeEventListener('visibilitychange', handleVisibility)
}
```

- [ ] **Step 2: Remove the old "Thinking..." loading indicator**

In `ChatBridgeChat.tsx`, find the loading indicator block (around line 836):

```tsx
{loading && (
  <Flex gap="xs" align="center" px="md">
    <Loader size="xs" />
    <Text size="sm" c="dimmed">
      Thinking...
    </Text>
  </Flex>
)}
```

Remove this entire block. The character now serves as the thinking indicator.

- [ ] **Step 3: Build and verify**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && source ~/.nvm/nvm.sh && nvm use 22 && CHATBOX_BUILD_PLATFORM=web npx electron-vite build 2>&1 | tail -5
```

Restart frontend, hard refresh. Verify:
- No more "Thinking..." text with spinner
- Character shows thinking animation instead when waiting for response
- Switch to another tab and back — animations resume smoothly

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/chatbridge/ThinkingCharacter.tsx src/renderer/components/chatbridge/ChatBridgeChat.tsx
git commit -m "feat: replace Thinking... indicator with character animation, add visibility pause"
```

---

### Task 8: Final polish and build

**Files:**
- Modify: `src/renderer/components/chatbridge/ThinkingCharacter.tsx` (if needed)

- [ ] **Step 1: Full rebuild**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox && source ~/.nvm/nvm.sh && nvm use 22 && CHATBOX_BUILD_PLATFORM=web npx electron-vite build 2>&1 | tail -5
```

- [ ] **Step 2: Restart all services and verify end-to-end**

```bash
cd /Users/san/Desktop/Gauntlet/chatbox
kill -9 $(lsof -ti:1212) 2>/dev/null; sleep 1
npx serve ./release/app/dist/renderer -l 1212 -s &
```

Open http://localhost:1212, hard refresh. Test the full flow:

1. Character visible on load, gently roaming in idle mode
2. Send "hi" → character moves to bottom, enters thinking mode (hand on chin, thought dots)
3. Response streams in → character nods along (streaming mode)
4. Response complete → character returns to idle roaming
5. Open chess → send a move → character shows tool_executing animation
6. Win a game → character celebrates (jumping, waving arms)
7. Switch tabs and back → animations resume

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: animated thinking character with GSAP - roams chat, reacts to events"
```
