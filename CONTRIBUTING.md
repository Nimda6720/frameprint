# Contributing to Frameprint

Thank you for your interest in contributing to **Frameprint**! Whether you are fixing a bug, proposing a new analytics chart, improving accessibility, or refining documentation, your contributions are welcome.

---

## Ways to Contribute

### 1. Reporting Bugs
Before opening a new issue, please check the [existing issues](https://github.com/Nimda6720/frameprint/issues) to see if the problem has already been reported.

When filing a bug report, please include:
- **Browser & OS** (e.g., Chrome 130 on Windows 11, Safari on iOS).
- **Export format used** (Letterboxd `.zip`, individual Letterboxd `.csv` files, or IMDb `.csv` export).
- **Steps to reproduce** the issue.
- **Expected vs. actual behavior**, along with screenshots or console logs if applicable.
- **Privacy note:** Never attach your full personal export if it contains private notes you do not wish to share publicly; instead, provide a minimal anonymized CSV snippet that reproduces the issue.

### 2. Suggesting Features & Enhancements
Have an idea for a new visualization, Cinema Personality archetype, or export card format?
- Open an issue on GitHub describing the feature, who it helps, and how it fits into Frameprint's privacy-first, client-side architecture.

### 3. Submitting Pull Requests
1. **Fork the repository** and create a feature branch from `main`:
   ```sh
   git checkout -b feat/your-feature-name
   ```
2. **Install dependencies** (Node.js 24+ and `pnpm` 11.25.0):
   ```sh
   pnpm install --frozen-lockfile
   ```
3. **Run the development server**:
   ```sh
   pnpm dev
   ```
4. **Verify all checks pass before submitting**:
   ```sh
   pnpm test                # Frontend unit & ZIP/CSV safety tests (Vitest)
   pnpm --dir worker test   # Cloudflare Worker unit tests
   pnpm typecheck           # TypeScript strict type checking
   pnpm build               # Production Vite bundle
   pnpm test:e2e            # Desktop & mobile Playwright E2E tests
   ```
5. **Open a Pull Request** against `main` with a clear description of what changed and why.

---

## Development Guidelines

- **Privacy by Design:** User files (`.zip` and `.csv`) must always be parsed locally in the browser (`src/lib/import.ts` and `src/workers/import.worker.ts`). Never send raw files, personal ratings, diary dates, or watchlists to any external server.
- **Secret Hygiene:** Never place a `TMDB_READ_TOKEN` or any private API credential in `VITE_*` environment variables, frontend source code, or Git commits. All TMDB requests go through the Cloudflare Worker (`worker/src/index.mjs`).
- **Responsive Layout:** Verify that new UI components work cleanly on both desktop (`1440px`) and mobile (`390px`) viewports without horizontal overflow.
- **Test Coverage:** Add or update unit tests in `tests/` or `worker/src/index.test.mjs` and browser E2E tests in `e2e/app.spec.ts` for any new functionality.

---

## License

By contributing to Frameprint, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
