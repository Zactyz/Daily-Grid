# Tier 2 Roadmap — Daily Grid Web

These features build on the Tier 1 foundation (liquid glass tab bar, medals hub, push notifications, profile page) to add social depth, deeper personalization, and sustainable monetization.

Approximate effort: **4–8 weeks** depending on scope.

---

## 1. User Accounts (Clerk Auth — Free Tier)

**Goal:** Optional sign-in that links scores, streaks, and medals to a persistent identity across devices.

**What to build:**
- Integrate [Clerk](https://clerk.com) (free up to 10 k MAU). Add the `<ClerkProvider>` script to hub pages.
- Add a "Sign in / Create Account" row to `/games/profile/` (currently a `// TODO` comment).
- Migrate the anonymous `anon_id` to a Clerk user ID on first sign-in, merging existing localStorage data.
- Store `user_id` alongside `anon_id` in all score tables.
- Show a real username and profile picture in the avatar ring (currently shows first initials).
- Display a "Sign in to save your progress across devices" banner for anonymous users.

**D1 migration needed:**
```sql
ALTER TABLE snake_scores     ADD COLUMN user_id TEXT;
ALTER TABLE bits_scores      ADD COLUMN user_id TEXT;
-- (repeat for all 9 game tables)
```

**Files to update:** `games/profile/index.html`, `games/common/shell-controller.js`, all `functions/api/*/complete.js`

---

## 2. Friends Leaderboard

**Goal:** Compete against specific people rather than strangers.

**What to build:**
- Friend codes (short alphanumeric ID derived from `user_id` hash).
- A `friendships` D1 table: `(user_id_a, user_id_b, created_at)`.
- `/api/friends/add`, `/api/friends/list` endpoints.
- On the medals page, add a "Friends" tab alongside "Everyone."
- The friends leaderboard queries only the `user_id`s in the friends list.

**D1 tables:**
```sql
CREATE TABLE friendships (
  user_id_a TEXT NOT NULL,
  user_id_b TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id_a, user_id_b)
);
```

---

## 3. JSON-LD Structured Data & Rich Results

**Goal:** Appear in Google rich results for puzzle/game searches.

**What to build:**
- Add `<script type="application/ld+json">` blocks to every game page:
  - `Game` schema with `name`, `description`, `url`, `applicationCategory: "Puzzle"`
  - `BreadcrumbList` for hub → game navigation
  - `FAQPage` schema pulling from How to Play content
- Add `hreflang` tags if localisation is added in Tier 3.
- Submit updated sitemap after deploy.

---

## 4. Google AdSense (Non-Intrusive)

**Goal:** Passive revenue without disrupting gameplay.

**Placement guidelines:**
- Desktop sidebar on `/games/` and `/games/medals/` only (never inside a game).
- A single "between game cards" slot on mobile (`max-width: 899px`), below the completed games section.
- Never inside the completion modal or during active play.
- Use AdSense's Auto Ads with placement exclusions set to avoid game iframes.

**Implementation:**
- Add AdSense script to hub pages only (`games/index.html`, `games/medals/index.html`).
- Use `<!-- [Tier 2] AdSense slot -->` placeholders already present in `games/index.html`.
- Test with an ad-blocker to ensure graceful degradation.

---

## 5. Weekly Recap Push Notification

**Goal:** Re-engage lapsed users with a personalized weekly summary.

**What to build:**
- A second Cloudflare Cron trigger, Sundays at 12:00 UTC.
- Query D1 for each subscriber's completions in the past 7 days.
- Send a personalised push: "You solved 5 puzzles this week. Can you go 7-for-7 next week?"
- Requires user accounts (item 1 above) to tie subscriptions to per-user data.

---

## 6. Notification Preferences

**Goal:** Let users control which notifications they receive.

**D1 column:**
```sql
ALTER TABLE push_subscriptions ADD COLUMN prefs TEXT DEFAULT '{"daily":true,"weekly":true}';
```

**UI:** Add a preferences section to `/games/profile/` under Notifications (currently `// TODO`).

---

## Priority Order

1. User Accounts (unlocks everything else)
2. JSON-LD (free SEO win, no dependencies)
3. Friends Leaderboard (high engagement)
4. Weekly Recap Push (needs accounts)
5. AdSense (after traffic establishes)
6. Notification Preferences (polish)
