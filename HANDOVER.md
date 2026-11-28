# Handover: where the Presentation maker stands

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

- The top-bar logo is hard-coded to Fossefall whichever brand is open (`FossefallLogo.tsx`).
- The product is called "Accesso" in code, which clashes with the company name. The owner
  asked for name ideas (Deckhand, Throughline, Onbrand were suggested); none chosen yet.
- No brand deletion. A new brand has an empty knowledge base.
- Shared deck links need the team password. Offered to open `/d/<id>` links; not decided.
- Logos are one colour and SVG only. Typed (not outlined) wordmarks in a PDF are not found.
- Decks are JSON files on one machine; agent runs live in the web process.

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
