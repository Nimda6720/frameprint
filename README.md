# Frameprint — Your Cinematic DNA

A public, no-login Letterboxd analytics dashboard. React, TypeScript and Vite on GitHub Pages; a Cloudflare Worker keeps the TMDB token server-side. The existing visual design is retained.

- Frontend: https://nimda6720.github.io/frameprint/
- Repository: https://github.com/Nimda6720/frameprint

## Features

Upload a Letterboxd export ZIP or individual watched.csv, ratings.csv or diary.csv. Explore unique films, personal ratings, diary viewing history, release decades, genres, countries, actors, directors and other crew, recurring director–actor collaborations, a searchable/filterable film library, and a downloadable Wrapped PNG or full JSON analysis. Demo data is fictional and labeled.

Genres, cast/crew, posters and runtime require the configured metadata Worker. Rankings count unique films, including distinct remakes. Known screen time multiplies known runtimes by dated diary viewings (at least one per watched title); unknown runtimes are excluded. It is a partial total, not an estimate of missing films. Timelines use Watched Date, never the date a title was added to Letterboxd. Cast rankings use the first 20 billed cast members; collaborations use the first 12 actors and directors.

## Local development

Use Node.js 24 and pnpm 11.25.0 (the packageManager field pins the version).

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm --dir worker test
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit
```

To use an existing Edge installation for browser tests on Windows, set `PLAYWRIGHT_CHANNEL=msedge`. The browser suite tests the production build on both desktop and mobile viewports. Set TEST_BASE_URL to run it against a deployed frontend.

For live metadata locally, put only the public Worker URL in .env.local:

```text
VITE_API_BASE_URL=https://frameprint-api.YOUR-SUBDOMAIN.workers.dev
```

Never put the TMDB token in a VITE_* variable, frontend source, workflow build environment, or Git. A Vite environment variable becomes public JavaScript.

## Cloudflare deployment

```sh
pnpm --dir worker exec wrangler login
pnpm --dir worker deploy
pnpm --dir worker exec wrangler secret put TMDB_READ_TOKEN
```

Enter your TMDB **API Read Access Token** into Wrangler's secret prompt, or use Cloudflare's dashboard: Workers & Pages → frameprint-api → Settings → Variables and Secrets → Add → Secret. Name it TMDB_READ_TOKEN and deploy the change. Obtain the token in your own TMDB account at https://www.themoviedb.org/settings/api. Do not paste it into chat or commit it.

The production origin is https://nimda6720.github.io (no /frameprint path). Local http://localhost:5173 is also allowed. Change worker/wrangler.jsonc if you use a different domain. The health endpoint `/health` exposes only whether a secret is present; a real enrichment request is needed to verify the token is valid.

Worker changes are deployed explicitly with `pnpm --dir worker deploy`. Frontend CI validates the Worker package but does not receive Cloudflare credentials or deploy it.

## GitHub Pages deployment

In repository Settings → Pages, set Source to GitHub Actions. Under Settings → Secrets and variables → Actions → Variables, create VITE_API_BASE_URL containing the public Worker URL. Push to main or run the Test and deploy Frameprint workflow.

The workflow installs from the lockfile, audits dependencies, runs frontend and Worker tests, checks TypeScript, packages the Worker, builds with base /frameprint/, runs desktop/mobile browser tests, and deploys only if checks pass. Pull requests run checks without deploying. Only the deploy job has Pages write permissions. No TMDB or Cloudflare secret is needed in GitHub.

## Privacy and security

- ZIP and CSV processing takes place in a dedicated browser Web Worker. Files, ratings, watch dates, reviews and user profiles are not uploaded. Closing/reloading the page clears the imported library.
- Only movie title, release year and the title/year matching key are sent to the metadata proxy. TMDB supplies metadata; images and fonts load from TMDB and Google. These providers receive ordinary network information such as IP addresses.
- Limits: 25 MB uploaded ZIP, 20 MB total selected CSV inflation, 10,000 ZIP entries, 100,000 rows per CSV, 20,000 unique films, and a 30-second import timeout. Actual decompressed bytes are counted while streaming. Unrelated ZIP entries are never inflated. Duplicate film CSVs are rejected.
- CSV is parsed as data and React escapes titles. Nothing from an upload is executed or extracted to a filesystem.
- The API accepts only POST /api/enrich with 1–8 validated titles and a maximum 24 KB body. It is not a generic proxy. CORS allows only configured origins; it does not authenticate non-browser clients.
- Cloudflare rate limiting allows 20 batches per minute per IP per location and fails closed if the binding is absent. It is approximate and is not a global spending cap. The client paces requests, retries 429 responses, and supports pause/resume.
- Public metadata is edge-cached for 14 days; confident no-match results for one day. Errors are not cached. Cache availability varies by Cloudflare location.
- Matching preserves non-Latin titles, requires an exact normalized title, prefers the release year (allows a one-year festival/distribution difference), and rejects ambiguous ties. Uncertain titles stay unmatched; metadata coverage is displayed. The matching policy favors missing data over incorrect attribution.
- Free tiers have usage limits. Monitor Cloudflare and TMDB usage before a high-traffic launch. No paid plan or custom domain is required by this project.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Frameprint is not affiliated with Letterboxd. Follow TMDB's API terms and attribution requirements for your use.
