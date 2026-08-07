# Speaking

Self-hosted replacement for a Noti.st speaking portfolio, running on Cloudflare
Workers. It shows the most recent conference talk, lists past talks, and lets
you upload a slide deck and have it rendered on that talk's page.

- **Framework**: React Router v7/v8 (framework mode) on Workers
- **Metadata**: Cloudflare D1
- **Slides**: Cloudflare R2 (original PDF plus one WebP per slide)
- **Admin auth**: Cloudflare Access, re-verified in the Worker

## How slide conversion works

Workers can't run LibreOffice or a headless browser, so conversion happens in
your browser at upload time. Export the deck to PDF (Keynote, PowerPoint and
Google Slides all do this natively), pick it in the admin form, and the page
rasterizes each page with `pdf.js` and uploads the images plus the original PDF
to R2. No third-party conversion service is involved.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Most recent talk, then all past talks |
| `/talks/:slug` | Slide viewer, abstract, video link, PDF download |
| `/slides/*` | Streams slide images/PDFs from R2 (fallback when no CDN domain) |
| `/admin` | Talk list, Sessionize prompts |
| `/admin/talks/new` | Add a talk and upload slides |
| `/admin/talks/:id/edit` | Edit metadata, replace slides, delete |
| `/api/talks*` | Upload endpoints used by the admin UI |

## Sessionize integration

If `SESSIONIZE_SPEAKER_ID` is set, `/admin` reads your Sessionize speaker feed
(`https://sessionize.com/api/speaker/json/<id>`) and shows:

- **Needs slides** — events that have already happened but have no talk here
  yet, each with a link that pre-fills the add-talk form.
- **Upcoming** — events still in the future.

Sessionize's speaker feed lists events and your session catalog as two separate
lists with no link between them, so it can tell you *that* an event happened but
not which talk you gave there. Matching an event to a talk is therefore done on
the Sessionize event id when present, otherwise on conference name plus year.

Leave `SESSIONIZE_SPEAKER_ID` blank to turn the whole section off.

## Local development

```bash
npm install
npm run db:migrate:local   # create the talks table in the local D1
npm run dev                # http://localhost:5173
```

Cloudflare Access sits in front of the deployed site, so there is no JWT to
verify locally. In dev the admin routes therefore authenticate as
`ADMIN_EMAIL` without checking anything. That branch is behind
`import.meta.env.DEV` and is stripped from production builds.

Other scripts:

```bash
npm run typecheck   # regenerates binding + route types, then tsc
npm run build
npm run deploy
```

## First-time Cloudflare setup

These steps can't be scripted from the repo — do them once, then fill in
`wrangler.jsonc`.

1. **Create the D1 database and R2 bucket**

   ```bash
   npx wrangler d1 create speaking-db
   npx wrangler r2 bucket create my-speaking-slides
   ```

   Put the returned `database_id` into `wrangler.jsonc`, then apply the schema
   to the remote database:

   ```bash
   npm run db:migrate:remote
   ```

2. **Deploy and point the domain at the Worker**

   ```bash
   npm run deploy
   ```

   Add a route/custom domain for `speaking.jmeiss.me` to the Worker in the
   Cloudflare dashboard (Workers & Pages → your Worker → Domains & Routes).

3. **Protect `/admin` with Cloudflare Access**

   In Zero Trust → Access → Applications, add a self-hosted application
   covering `speaking.jmeiss.me/admin` (and `/api/talks*`), with a policy
   allowing your email. Then copy into `wrangler.jsonc`:

   - `CF_ACCESS_TEAM_DOMAIN` — e.g. `yourteam.cloudflareaccess.com`
   - `CF_ACCESS_AUD` — the application's Application Audience (AUD) tag
   - `ADMIN_EMAIL` — the email allowed to upload

   The Worker verifies the Access JWT itself, so a misconfigured or deleted
   Access application fails closed instead of exposing the admin API.

4. **Optional: serve slides straight from R2**

   By default slide images are streamed by the Worker from `/slides/*`. To
   serve them directly from R2 instead, give the bucket a public custom domain
   (R2 → bucket → Settings → Public access → Custom domain), e.g.
   `cdn.speaking.jmeiss.me`, and set `SLIDES_CDN_URL` to it.

5. **Optional: Sessionize**

   Set `SESSIONIZE_SPEAKER_ID` to your Sessionize speaker id.

## Storage layout

```
talks/<talkId>/v<version>/source.pdf        original uploaded deck
talks/<talkId>/v<version>/slide-<n>.webp    one image per slide, 1-indexed
```

Each upload writes a new version, and the talk only points at it once every
file has landed. That makes replacing a deck atomic — visitors never see a mix
of the old and new one — and lets the images be cached immutably, since a given
URL's contents never change. The previous version is deleted once the new one
is live.

A talk also stays a draft (`published = 0`, hidden from the public pages and
from `/slides/*` but visible in `/admin`) until its first upload completes.
