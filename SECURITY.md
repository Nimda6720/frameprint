# Security and Privacy Policy

Frameprint is built around a **local-first, privacy-preserving architecture**. This document explains how user data is handled in the browser, what minimal data is sent for movie metadata enrichment, the security boundaries enforced by the application, and how to report security vulnerabilities.

---

## Privacy Architecture

### 1. Local In-Browser File Processing
- **Zero File Uploads:** When you import a Letterboxd `.zip` archive, Letterboxd `.csv` files (`watched.csv`, `ratings.csv`, `diary.csv`, `watchlist.csv`, `likes/films.csv`), or an IMDb `.csv` export, your files are parsed **entirely inside your browser** using a dedicated Web Worker (`src/workers/import.worker.ts`).
- **Private Data Stays Private:** Your personal star ratings, diary watch dates, rewatch counts, liked statuses, watchlist items, and file names **never leave your device**.
- **Optional Local Persistence:** By default, closing or refreshing the tab clears your imported library. If you explicitly opt into **"Save on this device"**, Frameprint stores your parsed library locally in your browser's `IndexedDB` (`src/lib/storage.ts`). You can wipe this local cache at any time with a single click via **"Delete my local data"**.

### 2. TMDB Metadata Matching (What Leaves the Browser)
- To display movie posters, runtimes, genres, countries, languages, cast, and crew, Frameprint sends **only film titles and release years** (`{ key, title, year }`) in batches to the Frameprint Cloudflare Worker proxy (`/api/enrich`).
- The Cloudflare Worker keeps the TMDB API Read Access Token (`TMDB_READ_TOKEN`) server-side as an encrypted Cloudflare Secret so it is never exposed in client-side JavaScript.
- Movie posters and portraits are loaded from TMDB's image CDN (`image.tmdb.org`), and web fonts are loaded from Google Fonts, which receive standard browser HTTP requests (such as your IP address).

---

## Security Controls & Hardening

### Archive & CSV Parser Safeguards
To protect users against malformed files or decompression ("ZIP bomb") attacks, the Web Worker enforces strict limits while streaming:
- **Max archive size:** 25 MB uploaded `.zip` file.
- **Max inflated CSV bytes:** 20 MB total decompressed bytes (counted during stream inflation, never trusting ZIP header metadata).
- **Max archive entries:** 10,000 entries per `.zip`; unrelated files and `deleted/` or `orphaned/` subfolders are skipped without inflating.
- **Max CSV rows & library size:** 100,000 rows per CSV and 20,000 unique films, with a 30-second worker execution timeout.
- **XSS Protection:** All CSV fields are parsed strictly as data and rendered through React's automatic HTML escaping. Nothing from an uploaded export is ever executed.

### Cloudflare Worker Proxy Safeguards
- **Strict Payload Validation:** `POST /api/enrich` accepts only validated batches of `{ key, title, year }` items with a strict 24 KB streamed payload cap.
- **Origin & Method Restrictions:** CORS is restricted to configured origins (`https://nimda6720.github.io` and local development origins).
- **Rate Limiting:** Enforced via Cloudflare's rate limiter binding per client IP, failing closed if the binding is missing.
- **Edge Caching:** Public TMDB metadata responses are cached at the Cloudflare edge for 14 days (and confident no-match results for 1 day); upstream errors are never cached.

---

## Supported Versions

Security updates are applied to the latest `main` branch and deployed to the live GitHub Pages site and Cloudflare Worker.

| Version | Supported |
| :--- | :--- |
| `main` (latest deployment) | ✅ Yes |
| Older commits / forks | ❌ No |

---

## Reporting a Vulnerability

If you discover a security or privacy vulnerability in Frameprint, please report it responsibly:

1. **Do not open a public GitHub issue** for unpatched security vulnerabilities.
2. **Use GitHub Private Vulnerability Reporting:** Go to the repository's [**Security → Advisories**](https://github.com/Nimda6720/frameprint/security/advisories/new) tab and submit a private report.
3. **Include details:** Provide a clear description of the vulnerability, affected component (`src/`, `worker/`, or `.github/workflows/`), and steps or proof-of-concept to reproduce it.

We will review and respond to vulnerability reports promptly and coordinate a fix before public disclosure.
