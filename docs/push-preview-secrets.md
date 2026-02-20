# Push Notifications on Preview Deployments

Preview deployments (e.g. `3352902e.daily-grid.pages.dev`) use a **separate environment** from Production. Secrets set via `wrangler pages secret put` apply only to Production.

To enable push notifications on preview URLs, add the same 4 secrets to the **Preview** environment.

## Option 1: Run the script (requires API token)

1. Create an API token: https://dash.cloudflare.com/profile/api-tokens  
   Use "Edit Cloudflare Workers" template or create custom with "Cloudflare Pages" Edit.

2. Run:
   ```bash
   CLOUDFLARE_ACCOUNT_ID=58f16335caa705944e98b17f67605842 CLOUDFLARE_API_TOKEN=your_token npm run push:preview-secrets
   ```

   Values are read from `.dev.vars`. Use the same keys as Production for consistency.

3. Redeploy the preview branch for changes to take effect.

## Option 2: Add manually in Dashboard

1. Go to [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. Select **daily-grid**
3. **Settings** > **Environment variables**
4. Under **Preview**, add these 4 variables (mark as **Encrypt**):
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
   - `PUSH_SECRET`

   Use the same values as Production. If you used the keys from `.dev.vars` when setting Production, use those same values here.

5. Redeploy the preview branch.
