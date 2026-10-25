# Deployment checklist

- [ ] GitHub Pages source is GitHub Actions.
- [ ] Cloudflare email is verified and frameprint-api is deployed.
- [ ] TMDB_READ_TOKEN is set as a Cloudflare Worker secret (never in GitHub/frontend).
- [ ] A live POST /api/enrich returns correct metadata for a known title/year.
- [ ] GitHub repository variable VITE_API_BASE_URL points to the deployed Worker.
- [ ] The latest Test and deploy Frameprint workflow is green.
- [ ] https://nimda6720.github.io/frameprint/ loads without console errors.
- [ ] Import examples/sample-letterboxd-export.zip and verify metadata coverage, timeline and Wrapped download.

Run pnpm test, pnpm --dir worker test, pnpm typecheck, pnpm build and pnpm test:e2e after changes. Re-deploy Worker changes separately with pnpm --dir worker deploy. No personal credentials belong in the repository.
