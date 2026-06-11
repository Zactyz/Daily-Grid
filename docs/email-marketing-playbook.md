# Daily Grid — Email Marketing Playbook

Operational guide for promotional email campaigns (new games, features, re-engagement).  
**Not** for sign-in OTP codes — those are transactional and use the same Resend account but different rules (see [Transactional vs promotional](#transactional-vs-promotional)).

---

## 1. What we have today

| Piece | Detail |
|-------|--------|
| **Sender** | Resend, domain `dailygrid.app` verified |
| **From address** | `Daily Grid <noreply@dailygrid.app>` (Cloudflare secret `AUTH_FROM_EMAIL`) |
| **Consent** | Click-through on Profile: user taps **Send code** and completes verify/link |
| **Database** | D1 `users.marketing_opt_in` (0/1), `users.marketing_opt_in_at` |
| **Privacy** | [privacy/index.html](../privacy/index.html) §7.6 |
| **Support / opt-out** | `support@dailygrid.app` |

**Who you may email (promotional):** users with `marketing_opt_in = 1` only.

```sql
-- Export list for a campaign (run via wrangler d1 execute --remote --command)
SELECT email, marketing_opt_in_at
FROM users
WHERE marketing_opt_in = 1
ORDER BY marketing_opt_in_at DESC;
```

---

## 2. Legal and compliance checklist

Use this before every send. When in doubt, send a smaller test batch first.

### Required (US CAN-SPAM + good practice)

- [ ] **Clear sender** — From name `Daily Grid`, address `@dailygrid.app`
- [ ] **Honest subject line** — matches email body (no bait-and-switch)
- [ ] **Physical mailing address** — include in footer (can use a registered agent / PO box if you have one; required for CAN-SPAM)
- [ ] **Unsubscribe mechanism** — every promotional email must include a way to opt out (see [Unsubscribe](#unsubscribe-options))
- [ ] **Honor opt-outs within 10 business days** — ideally immediate
- [ ] **Only opted-in recipients** — query `marketing_opt_in = 1`; never mail the full `users` table blindly
- [ ] **Separate transactional from promotional** — OTP codes are not marketing; do not add promo content to sign-in emails

### Consent (what we collect)

Users agree via Profile disclosure before **Send code**:

> By tapping Send code and linking your email, you agree to Terms and Privacy Policy, and consent to receive account emails and updates about Daily Grid (including new games and features).

On successful verify, we set `marketing_opt_in = 1`. Documented in Privacy Policy §7.6.

### Opt-out handling (must honor)

When someone asks to stop promotional email:

1. Set `marketing_opt_in = 0` in D1:

```sql
UPDATE users SET marketing_opt_in = 0 WHERE email = ?1;
```

2. Remove them from any Resend Audience / segment if you use one
3. Reply confirming they are unsubscribed
4. Do **not** remove their account or block sign-in OTP unless they request full account deletion

**Process owner:** whoever monitors `support@dailygrid.app` (document internally who this is).

### What not to do

- Do not buy email lists
- Do not email users who only have an `anon_id` and never linked email
- Do not email users who signed in before marketing consent existed without a one-time re-permission campaign
- Do not hide marketing consent inside a long Terms doc without the Profile disclosure (we show disclosure at point of sign-up)

### EU / UK (if you have EU users)

Click-through bundled consent is weaker than an explicit unchecked opt-in box. For a US-focused launch this is common; if EU traffic grows, consider:

- Separate optional marketing checkbox, or
- Resend only to users who opted in after a clearer EU-style notice

---

## 3. Unsubscribe options

Pick one primary method; you can combine footer link + support email.

| Method | Pros | Cons |
|--------|------|------|
| **A. Resend Audience + unsubscribe link** | Automatic; Resend handles link | Requires syncing D1 → Resend Audience |
| **B. `mailto:support@dailygrid.app`** | Simple now | Manual; slower |
| **C. Custom `/api/marketing/unsubscribe?token=`** | Full control | Needs building + signed tokens |

**Minimum viable (now):** footer line:

```text
Unsubscribe: reply to this email or email support@dailygrid.app with "unsubscribe".
```

**Recommended (next step):** Resend [Audiences](https://resend.com/docs/dashboard/audiences/introduction) + one-click unsubscribe in broadcast footer.

**Email headers (Resend API):** include `List-Unsubscribe` and `List-Unsubscribe-Post` when sending programmatically for better deliverability and Gmail one-click.

---

## 4. Branding guidelines for email

Match the PWA dark, gold-accent look ([DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)).

### Identity

| Item | Value |
|------|--------|
| **Product name** | Daily Grid (or Daily Grid Games on first mention) |
| **From name** | `Daily Grid` |
| **From email** | `noreply@dailygrid.app` |
| **Reply-to** | `support@dailygrid.app` (set in Resend send/broadcast) |
| **Site URL** | `https://dailygrid.app` |
| **Games hub** | `https://dailygrid.app/games/` |

### Colors (inline CSS — email clients ignore external stylesheets)

| Role | Hex | Usage |
|------|-----|--------|
| Background | `#020617` | Outer body |
| Card surface | `#0f172a` | Content panel |
| Primary text | `#f8fafc` | Headlines, body |
| Muted text | `#94a3b8` | Footer, captions |
| Brand gold | `#D4A650` | CTA buttons, accents |
| Gold hover/light | `#E5C37E` | Button gradient end |
| Link | `#E5C37E` | Underlined or gold text |

### Typography

- **Headings:** system stack similar to Space Grotesk — `font-family: 'Segoe UI', system-ui, sans-serif;`
- **Body:** `font-family: Inter, 'Segoe UI', system-ui, sans-serif;` (web font optional; system fallback is fine)
- **Avoid:** em dashes in copy (site style preference)

### Logo assets

| Asset | Path |
|-------|------|
| App icon 192 | `https://dailygrid.app/games/assets/dg-games-192.png` |
| OG / social | `https://dailygrid.app/games/assets/og-games.png` |

Use 48–64px wide logo in header, linked to `https://dailygrid.app/games/`.

### CTA button pattern

```html
<a href="https://dailygrid.app/games/"
   style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#D4A650,#E5C37E);color:#0b1120;font-weight:600;text-decoration:none;border-radius:8px;">
  Play today's puzzles
</a>
```

### Footer block (every promotional email)

```text
Daily Grid · dailygrid.app
You're receiving this because you linked an email to your Daily Grid account.

Unsubscribe: [link or support@dailygrid.app]
[Physical mailing address line]

Privacy: https://dailygrid.app/privacy/
Terms: https://dailygrid.app/terms/
```

---

## 5. Campaign types and outline templates

### Type A — New game launch

**When:** A new daily puzzle goes live (e.g. Tiles, BlindSlide).

**Audience:** `marketing_opt_in = 1`

**Subject ideas:**
- `New daily puzzle: [Game Name] is live`
- `[Game Name] just joined Daily Grid`

**Outline:**
1. **Hero** — game logo + one-line hook
2. **What it is** — 2 sentences, plain language
3. **Screenshot or simple diagram** (optional)
4. **CTA** — `Play [Game Name]` → `/games/[id]/`
5. **Secondary CTA** — `See all games` → `/games/`
6. **Footer** — unsubscribe + legal

---

### Type B — Feature / quality-of-life update

**When:** Accounts, friends leaderboards, streak sync, etc.

**Subject:** `Save progress across devices on Daily Grid`

**Outline:**
1. One benefit-led sentence
2. 3 bullet features (short)
3. CTA → Profile or relevant page
4. Footer

---

### Type C — Re-engagement (use sparingly)

**When:** User linked email but no activity in 30+ days (future: needs activity query).

**Subject:** `Your daily puzzles are waiting`

**Outline:**
1. Friendly nudge, no guilt
2. Today's date / streak mention if you have data
3. CTA → `/games/`
4. Easy unsubscribe (required for this type)

**Frequency cap:** max 1 re-engagement email per 30 days per user.

---

### Type D — Major announcement

**When:** App Store feature, big milestone, schedule change.

**Outline:** hero + single message + one CTA. Keep under 200 words.

---

## 6. Sending workflow (Resend)

### Option 1 — Resend Dashboard Broadcast (recommended for v1)

1. Create **Audience** (e.g. `marketing-opted-in`)
2. Export emails from D1 (SQL above), import CSV to Audience (email column only)
3. Create **Broadcast** with HTML template
4. Send test to yourself + 2 addresses
5. Schedule or send to Audience
6. Review Resend analytics (opens, bounces, unsubscribes)

Re-sync Audience before each campaign if new users linked since last send.

### Option 2 — Resend API / script (automated later)

- Batch send via `POST https://api.resend.com/emails` with `Authorization: Bearer re_...`
- Rate limit: respect Resend free tier (100 emails/day) or upgrade before large sends
- Store `resend_email_id` in a `email_sends` log table if you need audit trail (future)

### Pre-send checklist

- [ ] Audience = `marketing_opt_in = 1` only
- [ ] Test send to 2+ inboxes (Gmail + one other)
- [ ] Links work (especially `/games/` and game deep links)
- [ ] Unsubscribe path works
- [ ] From = `Daily Grid <noreply@dailygrid.app>`
- [ ] Reply-To = `support@dailygrid.app`
- [ ] Subject + preview text proofread
- [ ] No OTP / sign-in language in promotional template
- [ ] Old API key revoked if rotated recently

---

## 7. Transactional vs promotional

| | Transactional (OTP) | Promotional |
|--|---------------------|-------------|
| **Trigger** | User requests sign-in code | You initiate campaign |
| **Consent** | Necessary to provide linked account | `marketing_opt_in = 1` |
| **Content** | 6-digit code, expiry, ignore-if-not-you | News, games, features |
| **Unsubscribe** | Not required (account security) | Required |
| **Code path** | `functions/api/auth/request-code.js` | Manual / Resend Broadcast / future worker |
| **From** | Same `noreply@dailygrid.app` is OK | Same address OK; consider `news@dailygrid.app` later for separation |

Do not add marketing paragraphs to OTP emails.

---

## 8. Recommended roadmap

| Priority | Task |
|----------|------|
| **P0** | Manual opt-out process documented (support inbox + SQL above) |
| **P0** | Footer template with unsubscribe on every promo send |
| **P1** | Resend Audience synced from D1 before each campaign |
| **P1** | Add physical mailing address to footer (CAN-SPAM) |
| **P2** | `POST /api/marketing/unsubscribe` with signed token in email links |
| **P2** | Profile toggle: "Email updates" on/off → updates `marketing_opt_in` |
| **P3** | `email_sends` log table + bounce handling via Resend webhooks |

---

## 9. Secrets and rotation

After rotating Resend API key, update **two** Cloudflare environments:

1. **Production:** `wrangler pages secret put RESEND_API_KEY`
2. **Preview:** `node scripts/add-preview-auth-secrets.js`

See [scripts/RESEND-SETUP.md](../scripts/RESEND-SETUP.md).

OTP and any future marketing scripts share `RESEND_API_KEY` — rotating affects both.

---

## 10. Quick reference

| Question | Answer |
|----------|--------|
| Who can I mail? | `users` where `marketing_opt_in = 1` |
| How do they opt out? | support@dailygrid.app → set `marketing_opt_in = 0` |
| From address? | `Daily Grid <noreply@dailygrid.app>` |
| Brand gold? | `#D4A650` |
| Privacy section? | §7.6 Optional Email Account |
| Free tier limit? | 100 emails/day on Resend free plan |

---

*Last updated: 2026-06 — align with `profile-accounts` branch account linking flow.*
