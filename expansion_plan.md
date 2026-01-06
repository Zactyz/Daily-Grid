# Roadmap: Expanding Daily Grid Games

The goal is to transform `dailygrid.app` into a hub for "Calm Daily Logic Rituals." Here is a plan to scale the site with more games while maintaining a premium feel and non-intrusive monetization.

## 1. The Strategy: "The Daily Ritual Hub"
Instead of separate apps, keep everything under one "Daily Grid" brand. Each game should follow the same core philosophy:
- **Handcrafted**: One perfect puzzle per day.
- **Calm**: No timers, soft visuals, dark mode by default.
- **Personalized**: Unlockable decorations shared across the hub.

## 2. Monetization (Non-Annoying Ads)
To keep the site free while generating revenue, we should avoid pop-ups, video ads, or flashing banners.

### Option A: The "Puzzle Sponsor" (Recommended)
- **Concept**: A small, high-quality banner at the bottom of the game area.
- **Design**: "Today's puzzle is sponsored by [Partner Name]."
- **Ads**: Use **Carbon Ads** or **BuySellAds** which focus on non-intrusive, developer/designer-focused text ads.

### Option B: The "More Puzzles" Archive
- **Concept**: The daily puzzle is free.
- **Upsell**: Users pay a small subscription (or one-time fee) to access the 365-day archive of past puzzles.
- **Integration**: Link directly to your Apple App Store subscription for the mobile app.

## 3. Tech Stack Options
To add new games to the `/games` page, we have three paths:

### Option 1: Web-Based Canvas Games (Immediate)
- Build the games in JavaScript using HTML5 Canvas.
- **Pros**: Instant play on the site, great for SEO, very fast.
- **Cons**: Requires rewriting puzzle logic for the web.

### Option 2: Unity/Godot Web Export (Mid-Term)
- Export your mobile logic to a web build.
- **Pros**: Reuses your exact game engine and assets.
- **Cons**: High initial load time (users hate waiting for Unity to load on web).

### Option 3: "App First" Teasers (Current)
- The `/games` page serves as a landing page for upcoming standalone mobile apps.
- **Pros**: Drives downloads to the App Store where monetization is easier.
- **Cons**: Users can't play directly on the site.

## 4. Next Steps
1. **Choose the next game**: (e.g., Sudoku Grid, Link Grid, or Ornaments Grid).
2. **Setup Sub-Routing**: Create `/games/ornaments`, `/games/sudoku`, etc.
3. **Analytics**: Add basic tracking to see which "Coming Soon" cards get the most clicks to prioritize development.

