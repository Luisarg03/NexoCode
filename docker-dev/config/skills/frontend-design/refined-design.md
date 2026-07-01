# OpenDashboard Redesign: Layout Stabilization + Visual Refinement

## Root Cause Analysis
- `.session-meta` uses `auto auto 1fr` → content-length-dependent column widths → jitter
- `.trace-timeline-bar-row` uses flex → label/time widths shift per session
- Summary chips `flex-wrap` → variable row heights
- No layout containment → inner blocks reflow freely

## Solution: Grid Lock + Containment

### 1. Session Meta Grid Stabilization
```css
.session-meta {
  grid-template-columns: minmax(150px, 180px) minmax(110px, 140px) minmax(0, 1fr);
  /* explicit row tracks, no implicit sizing */
}
.meta-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 2. Timeline Bar Lock
```css
.trace-timeline-bar-row {
  display: grid;
  grid-template-columns: 42px 60px 1fr 42px 60px auto;
  /* fixed label/time slots, flex only for the slider */
}
```

### 3. Summary Chips Min-Height
```css
.trace-summary-chips {
  min-height: 2.25rem;
  /* prevents jump when chips render */
}
```

### 4. Layout Containment
```css
.session-detail-panel {
  contain: layout style;
}
```

### 5. Typography Refinement
- Tighter letter-spacing on headings
- Better font stack: `'DM Sans', 'Inter', system-ui`
- Refined spacing rhythm: 0.5rem / 0.75rem / 1rem / 1.5rem

### 6. Visual Quality
- Subtle shadow refinement on cards
- Border-radius consistency
- Better contrast ratios