# Tier 3 Roadmap — Daily Grid Web

Long-horizon features that require Tier 1 and Tier 2 as prerequisites. These represent the platform growing from a daily puzzle site into a full puzzle ecosystem.

Approximate effort: **3–6 months** total.

---

## 1. Story / Campaign Mode

**Goal:** A curated sequence of puzzles with increasing difficulty and a narrative arc, providing replayability beyond the daily format.

**What to build:**
- A `/games/story/` hub with chapters (e.g., "Snake: Beginner Journey" → 20 hand-crafted levels).
- Levels stored as JSON in KV (no D1 needed for read-only content).
- Progress tracked in localStorage (`dailygrid_story_${gameId}_chapter`) and synced to D1 once user accounts exist.
- Completion stamps and chapter-unlock animations using the existing confetti system.
- "Daily Grid Pass" — optional paid unlock for bonus chapter packs (see item 5 below).

---

## 2. Cosmetics & Avatar System

**Goal:** Give users things to collect and show off, creating a lightweight engagement loop.

**What to build:**
- Avatar frames (earned by streak milestones: 7, 30, 100 days).
- Profile background themes (earned by solving every game in a single day).
- Celebration effects (alternate confetti colors/patterns unlocked by medals count).
- All cosmetics stored in `user_cosmetics` D1 table and rendered in `/games/profile/`.
- No pay-to-win: cosmetics are earned, not purchased.

**D1:**
```sql
CREATE TABLE user_cosmetics (
  user_id TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, cosmetic_id)
);
```

---

## 3. Native App via Capacitor.js

**Goal:** Publish the web app to the iOS App Store and Google Play Store without rewriting any code.

**What to build:**
- Wrap the `/games/` PWA in a [Capacitor.js](https://capacitorjs.com) shell.
- Enable Capacitor's native push notification plugin (replaces the Web Push implementation, which is less reliable on iOS).
- Add native haptic feedback (`Haptics.impact()`) on puzzle completion and tile interactions.
- Use Capacitor's App plugin to deep-link push notifications directly to specific games.
- Submit to App Store (update existing Daily Grid listing to include the web games).

**Effort note:** Capacitor apps can share ~95% of the existing web codebase. The main work is CI/CD setup and App Store review.

---

## 4. Localisation (i18n)

**Goal:** Reach non-English-speaking puzzle enthusiasts (Japanese, Spanish, German markets are large).

**What to build:**
- Extract all user-facing strings to JSON locale files (`locales/en.json`, `locales/ja.json`, etc.).
- Use `Intl.MessageFormat` or a lightweight i18n library.
- Auto-detect browser language; allow manual override in Profile settings.
- Translate game names, instructions, and modal copy.
- Update `sitemap.xml` with `hreflang` alternate URLs.

---

## 5. In-App Purchases / Daily Grid Pass

**Goal:** Sustainable premium revenue beyond AdSense.

**What to build:**
- A "Daily Grid Pass" subscription ($1.99/month or $9.99/year) that unlocks:
  - Story mode bonus chapters.
  - Unlimited practice for all games (daily currently has practice; some future games may not).
  - Ad-free experience.
  - Exclusive cosmetic themes.
- Payment via Stripe (web) + Apple/Google IAP (native app).
- Entitlement stored in D1 `user_subscriptions` table, verified server-side.
- "Pass" badge displayed on Profile page.

**Notes:**
- Free tier must remain fully featured for puzzle gameplay.
- Pass is an optional enhancement layer.

---

## 6. Puzzle Sharing & Daily Challenge Links

**Goal:** Allow users to share specific puzzles as challenge links.

**What to build:**
- A short URL format: `dailygrid.app/c/{puzzleId}` that loads the exact puzzle.
- "Challenge a Friend" button in the completion modal, generating a shareable link.
- Recipient sees a custom preview (Open Graph image with the puzzle thumbnail).
- Track challenge completions in a `challenge_completions` D1 table.

---

## 7. Puzzle Difficulty Ratings

**Goal:** Surface difficulty information so users can choose their entry point.

**What to build:**
- After completing a puzzle, prompt: "How hard was this? Easy / Medium / Hard."
- Store ratings in `puzzle_ratings` D1 table.
- Display average difficulty next to each game on the hub.
- Influence the puzzle generator's difficulty seeds based on aggregate ratings.

---

## Priority Order

1. Native App via Capacitor.js (largest reach increase, especially iOS)
2. Story Mode (highest engagement / monetization potential)
3. Cosmetics (retention loop, no IAP needed)
4. Daily Grid Pass (monetization, requires Story Mode first)
5. Puzzle Sharing (viral growth)
6. Localisation (market expansion)
7. Difficulty Ratings (data collection for generator tuning)
