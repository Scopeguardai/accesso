# Handover: where Voila (the presentation maker) stands

Written 28 November 2026 so that work can continue in a new chat. Read this first, then
`README.md` (what the app does and how it is built) and `AGENTS.md` (Next.js 16 has
breaking changes: read `node_modules/next/dist/docs/` before writing Next code).

## The owner and how they work

- The owner is not a developer. Explain in plain language, give exact clicks and commands,
  and say plainly what is tested and what is not.
- They run the app in the GitHub Codespace "bug-free barnacle" with `npm run dev:sync`,
  which pulls from `main` every 30 seconds. Address while running:
  https://bug-free-barnacle-965996g5r7p7c7g46-3000.app.github.dev/ (private to their GitHub login).
- Work lands by committing to `main` and pushing. Fetch first (`git fetch origin main`).
- Never ask for, type or commit the API key or the team password. They live in `.env.local`
  (`ANTHROPIC_API_KEY`, `ACCESSO_PASSWORD`) or as Codespaces secrets.
- Wording they asked for: "humans" (not "people") when contrasted with the agent; plain,
  direct language; consistent terms.
- They once said "undo that" to a home page redesign. Check before large visual changes
  to pages they already know.

## What exists (all on `main`)

| Area | State |
|---|---|
| Front page `/` | Three ways to set up a brand (by hand, guidelines, website) and the list of brands |
| Sign-in | One shared password via `ACCESSO_PASSWORD`; `src/proxy.ts`, `src/lib/auth.ts`, `/login` |
| Make a presentation `/new` | Brief, options, deck tiles; `?brand=` opens on that brand |
| Deck workspace `/studio/<id>`, deck page `/d/<id>` | Built earlier; one sample deck, `sample-fossefall` |
| Knowledge base `/knowledge` | Built earlier |
| Design system `/design?brand=` | View and edit everything; upload logo, fonts, images; add and remove palettes; new brand |
| Guidelines import | PDF upload or link; agent proposes tagline, palettes, font names, rules as a draft to apply and save |
| Website as identity guide | Reads one page's text and styling; agent proposes a draft |
| Logo finder | Vector PDF: drawn shapes grouped into a gallery of one-colour SVGs. Website: every SVG on the page. Pick one as wordmark or symbol, or download it |
| Brand folder | A brand's folder of client files (folder or zip upload, `data/sources/<brand>`); an agent with list/read/view tools picks logo, fonts, photos and proposes colours and rules (`src/lib/brand/sources.ts`, `folder-agent.ts`, `BrandFolder.tsx`) |
| Delete brand | From its card; moves to `data/trash/`, restorable from Recently deleted |
| Presentation styles | Knowledge base tab; `src/lib/knowledge/styles.ts`, `StylesView.tsx`; the brief carries `style`; guidance is added to the agent's system prompt in `run.ts` |
| PNG/JPG logo converter | Logo section of the design system; `src/lib/brand/trace.ts` (sharp + potrace); returns a colour SVG and a one-colour SVG, nothing saved until chosen |
| Style from example presentations | Styles tab; `src/lib/knowledge/examples.ts` (PDF pages rendered with unpdf + @napi-rs/canvas, .pptx read with fflate), `style-agent.ts`; uploads go in 8 MB pieces. Not yet run with a real key |

Key files added in this stretch: `src/lib/brand/{assets,design,create,import,import-source,pdf-graphics}.ts`,
`src/app/api/{brands,design,login}/`, `src/components/workspace/DesignView.tsx` + `design.css`,
`src/components/landing/`.

## Not verified

- **The agent has never been run with a real API key.** Deck generation, the guidelines
  reader and the website reader are untested end to end. This is the first thing to do
  once the owner has added a key: make a deck for Fossefall, and read the Fossefall
  guidelines PDF into a test brand, then tune the prompts from the results.
- Only run in dev mode. `npm run build` and any hosting are untested.
- Website reading was tried on three live links only. The logo finder was tuned on one PDF
  (the Fossefall guidelines).

## Known limits

- The app's own logo is a stand-in Voila wordmark set in Inter (`src/components/VoilaLogo.tsx`,
  `public/voila-wordmark.svg`, browser icon `src/app/icon.svg`). Swap in a designed logo when there is one.
- The product is called **Voila** (renamed from "Accesso" on 28 November; spelt without the
  accent as the owner typed it). Internal identifiers still say accesso on purpose: the repository
  name, the `ACCESSO_*` settings, the session cookie and the package name. Renaming those would
  break the owner's `.env.local` or sign people out. The Claude plugin keeps the name `accesso`
  and the Drive folder `Accesso knowledge`, because those belong to the company.
- A new brand has an empty knowledge base. Deleted brands sit in `data/trash/` (restorable from
  the front page) and are never emptied automatically.
- Shared deck links need the team password. Offered to open `/d/<id>` links; not decided.
- A logo with its own colours keeps them on every slide, dark ones included; offered but not built: colour on light backgrounds and one colour on dark, automatically. Logos found in PDFs come out in one colour. Typed (not outlined) wordmarks in a PDF are not found.
- Decks are JSON files on one machine; agent runs live in the web process.

## Upload size in the codespace

GitHub's connection to the codespace refuses any request over about 16 MB (measured: 16.7 MB
passes, 17 MB gets a 413 page). Brand-folder uploads go in batches of up to 12 MB, and larger
files in 8 MB pieces through `/api/design/sources/chunk`. A guidelines PDF over 12 MB goes to the
brand folder in pieces and is read from there (`folderFile`). Keep any new upload under that limit.

## Brand folder: next steps

- Google Drive and SharePoint/OneDrive as places the agent can search. Everything that reads the
  folder goes through `listFiles` and `readFile` in `src/lib/brand/sources.ts`; a cloud source
  needs the same two functions. Drive: a service account the client folder is shared with.
  SharePoint: an Entra app registered by the owner's IT with read access to chosen sites.
- The folder agent has not been run with a real key.

## Offered and not yet answered

1. Pull photos out of guideline PDFs into the image library, with a tick box each.
2. Fetch free Google fonts automatically when the guidelines name one.
3. Draw-a-box fallback for picking a logo from a PDF page.
4. Open deck share links to people without the password.
5. Rename the product throughout once a name is chosen.

## Testing routine used so far

- `npx tsc --noEmit -p .` and `npm test` (11 self-checks in `scripts/selftest.ts`).
- Browser checks with Playwright against `npx next dev -p 3100`, desktop and phone widths.
- Tests create brands under `brands/` and `public/brands/`: restore afterwards with
  `git checkout -- brands public/brands && git clean -fdq brands public/brands`.
- To test sign-in, start the dev server with a throwaway `ACCESSO_PASSWORD` value in its
  environment; never use the owner's.

## Related work outside this repository

- Claude Docs made for the owner: "accesso commercial AI: build plan", "accesso marketing:
  future needs", "accesso knowledge library: setup guide", "Presentation maker: Claude
  project setup".
- A Claude project package (seven Markdown files: instructions, product guide, brand setup
  guide, brief template, deck checklist, client register, technical reference).
- The Claude plugin in `plugin/` (new-deck, add-client, content-flow, deck-review).
