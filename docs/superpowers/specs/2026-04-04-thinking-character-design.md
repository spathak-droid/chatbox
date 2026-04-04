# Thinking Character — Animated Chat Companion

## Overview

An always-visible SVG character that lives inside the chat area of ChatBridgeChat. It reacts to app events (LLM thinking, tool calls, game results) and roams freely around the chat when idle. Animated with GSAP. Blue theme matching the app UI.

## Character Design

**Appearance (~80px tall):**
- Round body with blue gradient (`#228be6` to `#1c7ed6`)
- Two large white eyes with dark pupils (primary expression driver)
- Small curved mouth that changes shape per mood
- Tiny stubby arms and legs (rounded rectangles)
- Small antenna or tuft on top for personality

**All elements are inline SVG** — no external assets, no images, fully self-contained.

## Mood States

| State | Trigger | Eyes | Mouth | Body | Duration |
|-------|---------|------|-------|------|----------|
| Idle | No loading, no events | Normal, slow blink | Slight smile | Gentle bob up/down | Continuous |
| Thinking | `loading = true` (waiting for LLM) | Looking up-right, pupils shift | Flat/pursed | Hand on chin, thought dots above head | Until response starts |
| Tool executing | `tool_call` SSE event received | Focused, slightly narrowed | Determined | Arms moving, sparkles/gear effect | Until tool result |
| Streaming | LLM response streaming in | Looking down, following text | Slight smile | Nodding along | Until stream ends |
| Celebrating | Game won, level complete, confetti events | Happy squint (eyes become arcs) | Big open smile | Jumping, waving both arms | 3s then return to idle |
| Confused | Error or moderation block | Uneven eyes, one raised | Squiggly/wavy | Scratching head | 3s then return to idle |

## Behavior Model

### Always visible
The character is always rendered. It does not appear/disappear with loading state.

### State-driven reactions
The character's mood is driven by app events, not random cycling:

1. **Idle (student reading/typing):** Roaming phase. Character wanders the chat area freely — walks along message edges, sits on a bubble, floats around. Slow, relaxed movements. Occasionally blinks or waves. Moves to a new random position every 4-6 seconds.

2. **Thinking (waiting for LLM):** Stays near the bottom of chat (close to where the response will appear). Hand-on-chin pose with animated thought dots above head.

3. **Tool executing:** Working animation with focused expression. Arms busy. Stays near bottom.

4. **Streaming:** Eyes follow downward as text appears. Gentle nodding. Stays near bottom.

5. **Celebrating:** Momentary reaction — jumps, waves both arms, big smile. Triggered by game_won/level_complete events. Returns to idle after ~3 seconds.

6. **Confused:** Momentary reaction — scratches head, squiggly mouth. Triggered by errors. Returns to idle after ~3 seconds.

### Roaming (idle only)
- GSAP picks random positions within the **visible** chat area (viewport, not scrolled-off content)
- Character walks/floats between positions every 4-6 seconds
- Movement uses `power2.inOut` easing for smooth, natural motion
- Character faces the direction it's moving (flip SVG horizontally)
- ~50% opacity during idle roaming so it doesn't block reading
- Full opacity during active states (thinking, celebrating, etc.)

## Technical Implementation

### New files
- `src/renderer/components/chatbridge/ThinkingCharacter.tsx` — React component containing:
  - Inline SVG character with named refs for each body part (leftEye, rightEye, mouth, leftArm, rightArm, leftLeg, rightLeg, body, thoughtDots)
  - GSAP animation logic for all mood states
  - Roaming position picker
  - Event-driven state machine

### Integration (ChatBridgeChat.tsx)
```tsx
// Inside the ScrollArea container, absolute positioned
<ThinkingCharacter
  mode={characterMode}  // 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'celebrating' | 'confused'
  containerRef={scrollAreaRef}  // bounds for roaming
/>
```

**Mode derivation in ChatBridgeChat:**
- `loading && !streaming` → `'thinking'`
- Tool call SSE event received → `'tool_executing'`
- Text SSE chunks arriving → `'streaming'`
- Game event (won/level_complete) → `'celebrating'` (3s timeout back to idle)
- Error event → `'confused'` (3s timeout back to idle)
- Default → `'idle'`

### GSAP animation structure
- One `gsap.context()` per component mount for cleanup
- Separate timelines per mood: `idleTimeline`, `thinkingTimeline`, `walkingTimeline`, etc.
- On mode change: kill current timeline, start new one
- Roaming uses standalone `gsap.to()` tweens targeting the container position
- Blink animation: runs on a `gsap.delayedCall()` loop every 3-5 seconds (random interval)

### SVG structure (simplified)
```svg
<svg viewBox="0 0 80 100" width="80" height="100">
  <!-- Body -->
  <ellipse cx="40" cy="60" rx="25" ry="28" fill="url(#bodyGradient)" />
  <!-- Eyes -->
  <circle cx="30" cy="52" r="8" fill="white" />  <!-- left eye -->
  <circle cx="50" cy="52" r="8" fill="white" />  <!-- right eye -->
  <circle cx="32" cy="52" r="4" fill="#1a1a2e" /> <!-- left pupil -->
  <circle cx="52" cy="52" r="4" fill="#1a1a2e" /> <!-- right pupil -->
  <!-- Mouth -->
  <path d="M 32 68 Q 40 74 48 68" stroke="#1a1a2e" fill="none" stroke-width="2" />
  <!-- Arms -->
  <rect x="12" y="55" width="6" height="16" rx="3" fill="#1c7ed6" /> <!-- left arm -->
  <rect x="62" y="55" width="6" height="16" rx="3" fill="#1c7ed6" /> <!-- right arm -->
  <!-- Legs -->
  <rect x="28" y="84" width="6" height="12" rx="3" fill="#1c7ed6" /> <!-- left leg -->
  <rect x="46" y="84" width="6" height="12" rx="3" fill="#1c7ed6" /> <!-- right leg -->
  <!-- Antenna -->
  <line x1="40" y1="32" x2="40" y2="22" stroke="#228be6" stroke-width="2" />
  <circle cx="40" cy="20" r="4" fill="#228be6" />
  <!-- Thought dots (hidden by default) -->
  <g id="thoughtDots" opacity="0">
    <circle cx="58" cy="30" r="3" fill="#aaa" />
    <circle cx="65" cy="22" r="4" fill="#aaa" />
    <circle cx="74" cy="14" r="5" fill="#aaa" />
  </g>
</svg>
```

### Performance
- `will-change: transform` on the character container
- All animations use `transform` and `opacity` only (GPU composited, no layout reflow)
- Pause animations when document is hidden (`visibilitychange` event)
- `gsap.context()` cleanup on unmount — no memory leaks

### Dependencies
- `gsap` — npm package, ~30kb gzipped. No other dependencies.

## What this does NOT include
- Sound effects
- User interaction with the character (clicking, dragging)
- Character customization/settings
- Multiple characters
- The BullMQ request queue (separate feature, will resume after this)
