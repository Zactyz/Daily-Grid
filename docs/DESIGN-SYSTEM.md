# Daily Grid — Design System

> Authoritative reference for all visual and interaction design decisions in the Daily Grid PWA.  
> Every new page or component should derive from these tokens and guidelines.

---

## 1. Design Principles

| Principle | Description |
|-----------|-------------|
| **Dark-first** | All pages use dark backgrounds. No light-mode pages. |
| **Glass morphism** | Panels and cards use translucent blur surfaces, not solid fills. |
| **Per-game personality** | Each game overrides `--brand-accent` with its own color. Everything else is shared. |
| **PWA-native feel** | No browser chrome visible; content respects safe areas; no hover-only states. |
| **Touch-first** | All interactive targets ≥ 44 × 44 px. No double-tap zoom. |
| **Minimal decoration** | Subtle grid texture, ambient gradients at the edges — not loud backgrounds. |

---

## 2. Color Tokens

All tokens are defined in `games/common/design-tokens.css` and override-able per game.

### 2.1 Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `--dg-bg` | `#020617` | Hub, Medals, Profile, Practice pages |
| `--dg-bg-game` | `#0a0a0f` | Game page body background |
| `--dg-bg-surface` | `rgba(255,255,255,0.03)` | Card / panel surface |
| `--dg-bg-surface-1` | `rgba(255,255,255,0.05)` | Elevated surface (second layer) |
| `--dg-bg-input` | `rgba(255,255,255,0.06)` | Input fields, toggles |

### 2.2 Text

| Token | Value | Usage |
|-------|-------|-------|
| `--dg-text` | `#f8fafc` | Primary body text |
| `--dg-text-2` | `rgba(248,250,252,0.65)` | Secondary / caption text |
| `--dg-text-3` | `rgba(248,250,252,0.40)` | Muted / hint / disabled text |

### 2.3 Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--dg-border` | `rgba(255,255,255,0.08)` | Default panel borders |
| `--dg-border-1` | `rgba(255,255,255,0.12)` | Emphasized borders |
| `--dg-border-2` | `rgba(255,255,255,0.18)` | High-contrast borders (active states) |

### 2.4 Brand & Accents

| Token | Value | Usage |
|-------|-------|-------|
| `--dg-gold` | `#D4A650` | Brand gold — hub, medals, profile |
| `--dg-gold-light` | `#E5C37E` | Gradient end / shimmer highlight |
| `--brand-accent` | per-game | Game accent color — overridden locally |
| `--brand-accent-dim` | per-game | Darker shade for gradients |

**Per-game accent palette:**

| Game | Accent | Accent Dim |
|------|--------|------------|
| Snake | `#f0c674` | `#c9a85c` |
| Pathways | `#f08080` | `#d66a6a` |
| Bits | `#5bff94` | `#41d97f` |
| Bridgeworks (Hashi) | `#6aa7d9` | `#3d7fb4` |
| Parcel (Shikaku) | `#c9a36b` | `#a77a45` |
| Conduit | `#ffe44d` | `#facc15` |
| Perimeter | `#7da2ff` | `#5f80d6` |
| Polyfit | `#f59e0b` | `#d97706` |
| Logice (Lattice) | `#7dd3fc` | `#38bdf8` |

### 2.5 Status Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--dg-green` | `#22c55e` | Success, completion checkmarks |
| `--dg-red` | `#ef4444` | Error, badge notifications |
| `--dg-orange` | `#f97316` | Streak badges, warnings |

### 2.6 Leaderboard Rank Colors

| Rank | Token | Value |
|------|-------|-------|
| #1 | `--dg-rank-1` | `#f6d27f` |
| #2 | `--dg-rank-2` | `#cbd5e1` |
| #3 | `--dg-rank-3` | `#d6a16a` |

---

## 3. Typography

### 3.1 Font Stack

| Token | Stack | Usage |
|-------|-------|-------|
| `--dg-font-ui` | `'Space Grotesk', 'Inter', -apple-system, sans-serif` | **All UI text** (body, buttons, labels, nav) |
| `--dg-font-heading` | `'Space Grotesk', 'Inter', sans-serif` | Headings within games and app pages |
| `--dg-font-marketing` | `'Merriweather', serif` | **Landing page only** (hero headings) |
| `--dg-font-mono` | `'JetBrains Mono', 'Courier New', monospace` | Timers, scores, puzzle IDs, code |

> `Space Grotesk` is the **primary** font across the entire PWA experience.  
> `Inter` is loaded as fallback on hub pages and shares the same geometric sans-serif feel.  
> `Merriweather` is reserved exclusively for `index.html` (the marketing landing page).

### 3.2 Scale

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Page title | `1.5rem` (24px) | 700 | Game name, section headers |
| Section heading | `1.125rem` (18px) | 600 | |
| Body | `0.9375rem` (15px) | 400 | |
| Caption | `0.8125rem` (13px) | 500 | Labels, badges |
| Tiny | `0.6875rem` (11px) | 600 | Uppercase tracking labels |
| Timer / score | `1.5–2rem` | 700 | JetBrains Mono |

### 3.3 Letter Spacing

- Headings: `-0.02em`
- Body: `0`
- Uppercase labels: `+0.15em`
- Monospace: `0` or `+0.02em`

---

## 4. Spacing & Sizing

### 4.1 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--dg-radius-sm` | `8px` | Tags, small chips |
| `--dg-radius-md` | `12px` | **Buttons** |
| `--dg-radius-lg` | `16px` | **Cards, canvases** |
| `--dg-radius-xl` | `24px` | Modals, large panels, tab bar |
| `--dg-radius-full` | `9999px` | Pills, avatars, badges |

### 4.2 Layout Spacing

| Context | Value |
|---------|-------|
| Page horizontal padding | `1rem` (mobile), `1.5rem` (≥ 640px) |
| Card padding | `1rem` |
| Section gap | `0.75rem` |
| Component gap | `0.5rem` |
| Button padding | `0.625rem 1.25rem` |

### 4.3 Tab Bar Clearance (Critical for PWA)

| Token | Value | Notes |
|-------|-------|-------|
| `--dg-tab-bar-h` | `64px` | Physical tab bar height (keep in sync with `tab-bar.css`) |
| `--dg-bottom-clear` | `calc(64px + env(safe-area-inset-bottom, 0px) + 0.75rem)` | **All scrollable pages must apply this as `padding-bottom` on mobile** |

> **Rule:** Every page that loads `tab-bar.js` must add `padding-bottom: var(--dg-bottom-clear)` to its  
> outermost scrollable container on screens ≤ 899px. Use the `.tab-bar-clear` utility class.

---

## 5. Surfaces & Effects

### 5.1 Glass Surface Levels

| Class | Background | Blur | Border | Usage |
|-------|-----------|------|--------|-------|
| `.glass` | `rgba(255,255,255,0.03)` | `blur(20px)` | `--dg-border` | Cards, panels |
| `.glass-strong` | `rgba(255,255,255,0.05)` | `blur(24px)` | `--dg-border-1` | Modals, overlays |
| Tab bar | `rgba(255,255,255,0.08)` | `blur(28px) saturate(160%)` | `rgba(255,255,255,0.18)` | Navigation bar |

### 5.2 Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--dg-shadow-card` | `0 4px 24px -4px rgba(0,0,0,0.35)` | Cards |
| `--dg-shadow-modal` | `0 20px 60px -8px rgba(0,0,0,0.6)` | Modals |
| `--dg-shadow-btn` | `0 2px 12px rgba(0,0,0,0.25)` | Primary buttons |

---

## 6. Components

### 6.1 Buttons

Two button families exist:
- **`.btn .btn-primary` / `.btn .btn-secondary`** — CTA buttons, completion modals (defined in `games-base.css`)
- **`.shell-btn`** — In-game control buttons (Reset, Hint, New Puzzle — defined in `shell.css`)

| Rule | Value |
|------|-------|
| Minimum height | `44px` |
| Border radius | `--dg-radius-md` (12px) |
| Font weight | 600 |
| Font size | `0.875rem` (14px) |
| Padding | `0.625rem 1.25rem` |

`.btn-primary`: `background: linear-gradient(135deg, --brand-accent, --brand-accent-dim); color: #0a0a0f`  
`.btn-secondary`: `background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10); color: --dg-text-2`

### 6.2 Cards / Panels

```css
border-radius: var(--dg-radius-lg);   /* 16px */
background: var(--dg-bg-surface);
border: 1px solid var(--dg-border);
padding: 1rem;
```

### 6.3 Modals / Overlays

```css
border-radius: var(--dg-radius-xl);   /* 24px */
background: var(--dg-bg-surface-1);
border: 1px solid var(--dg-border-1);
backdrop-filter: blur(24px);
box-shadow: var(--dg-shadow-modal);
```

---

## 7. Mobile PWA Requirements

### 7.1 Viewport Meta (required on every page)

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0,
  maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

> `viewport-fit=cover` is **mandatory** — without it, `env(safe-area-inset-bottom)` returns `0`
> on iPhone, meaning the tab bar overlaps the home indicator and content at the bottom.

### 7.2 Status Bar

```html
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#020617">
```

### 7.3 Touch Targets

- All interactive elements must be ≥ 44 × 44 px (Apple HIG requirement)
- Game canvas interactions are exempt (pointer-level precision is handled by the game engine)
- Use `min-height: 44px` and `min-width: 44px` on navigation items, buttons, toggles

### 7.4 Bottom Clearance

Apply `.tab-bar-clear` to the outermost scrollable container on every page that uses the tab bar:

```css
/* Defined in design-tokens.css */
.tab-bar-clear {
  padding-bottom: var(--dg-bottom-clear);
}
@media (min-width: 900px) {
  .tab-bar-clear { padding-bottom: 2rem; }
}
```

### 7.5 Scroll Behavior

- Scrollable pages: `overflow-y: auto; -webkit-overflow-scrolling: touch`
- Game canvas: `touch-action: none` during play, `touch-action: auto` after completion
- Prevent text selection on game elements: `-webkit-user-select: none`

---

## 8. Background Ambience

Each game page adds a subtle ambient gradient overlay via `body::before` that complements its accent color. This is the **only** visual element that differentiates game backgrounds beyond the accent color.

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(ACCENT_RGB, 0.10), transparent),
    radial-gradient(ellipse 60% 40% at 100% 100%, rgba(ACCENT_RGB, 0.06), transparent);
  pointer-events: none;
  z-index: -1;
}
```

---

## 9. Known Inconsistencies (Planned Fixes)

| Issue | Affected Files | Priority |
|-------|---------------|----------|
| Font: `Inter` used on hub/medals/profile instead of `Space Grotesk` | `games/index.html`, `medals/index.html`, `profile/index.html` | Medium |
| No central token file — variables scattered per file | All game HTML files | Done via `design-tokens.css` |
| Per-game `--brand-bg` values all differ slightly | 9 game HTML files | Low (visual identity) |
| `body::after` grid texture on game pages only, not hub | `games-base.css` | Low |
| Practice page uses older layout without tab-bar clearance | `practice/index.html` | Medium |

---

## 10. File Roles

| File | Purpose |
|------|---------|
| `games/common/design-tokens.css` | **Source of truth** for all CSS custom properties |
| `games/common/games-base.css` | Base reset, typography, button classes, glass utilities for game pages |
| `games/common/shell.css` | Shell layout (header, controls, modals, stat cards) for the 9 game pages |
| `games/common/tab-bar.css` | Tab bar styling and bottom-clearance utility |
| `games/common/tutorial-modal.css` | Tutorial walkthrough overlay |
| `games/common/tab-bar.js` | Mounts tab bar HTML; sets active state |
| `games/common/shell-controller.js` | Game lifecycle, completion modal, timer, onboarding |
| `games/common/shell-ui.js` | Leaderboard and modal DOM rendering |
| `games/common/shell-mount.js` | Validates required DOM elements and boots shell |

---

*Last updated: 2026-02-26*
