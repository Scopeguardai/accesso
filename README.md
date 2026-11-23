# Accesso

An agent that plans, writes and designs presentations in a brand's style and publishes
each one as a responsive web page.

First brand: **Fossefall**.

## What works today

- **Brief in, deck out.** A form takes the topic, audience, goal, length and points to
  include. The agent searches the knowledge base, writes an outline, designs the slides
  and records suggestions.
- **A URL per deck.** `/d/<id>` pages through slides on a wide screen and reflows each
  slide into a single column on a phone.
- **Edits by prompt.** In the studio (`/studio/<id>`), describe a content or design
  change for the whole deck or only the slide in view. Suggestions from the agent can be
  applied with one click.
- **Brand pack.** Fonts, logo, palettes, image library and written brand rules for
  Fossefall, taken from the supplied guideline and template.
- **Knowledge base.** Markdown files per client, with search and per-slide source
  tracking.

Not built yet: editing text directly on the slide, asset upload, asset search and image
generation, user accounts, and hosting.

## Run it

Needs Node 20 or newer.

```bash
npm install
cp .env.example .env.local     # then put your Anthropic API key in .env.local
npm run dev                    # http://localhost:3000
```

Without an API key you can still open the sample deck at
`/d/sample-fossefall` and the studio at `/studio/sample-fossefall`; creating or editing
a deck will report that the key is missing.

```bash
npm test          # checks the brand pack, sample deck, knowledge search and agent tools
npm run typecheck
npm run build
```

## How it fits together

```
brands/<brand>/        brand.json (fonts, palettes, images) and BRAND.md (rules the agent reads)
public/brands/<brand>/ the font, logo and image files themselves
knowledge/<client>/    Markdown the agent may cite; see knowledge/README.md
plugin/skills/         content-flow, deck-design, deck-review: how the agent works
data/decks/            one JSON file per deck
src/lib/deck/          the deck format (schema.ts) and file store
src/lib/agent/         the agent: its tools, prompts and the Claude Agent SDK run loop
src/components/        the renderer (DeckView.tsx, deck.css) and the app screens
src/app/               pages and API routes
```

**A deck is data, not HTML.** `src/lib/deck/schema.ts` defines thirteen slide layouts
with length limits. The agent can only produce slides that pass that schema, name images
from the brand's library and cite files that exist in the knowledge base; anything else
is rejected with a reason it can act on. The renderer owns all colour, type and spacing,
which is what keeps every deck on brand and lets the same deck reflow for phones.

**The agent has nine tools and nothing else.** It cannot read files, run commands or use
the web. It searches and reads the knowledge base, and reads and changes the one deck it
was started for (`src/lib/agent/deck-tools.ts`).

**Skills are plain files.** The three skills in `plugin/skills` are loaded into the
agent's instructions on every run, together with the brand's `BRAND.md`. The `plugin`
folder is also a valid Claude plugin, so the same skills can be installed in Claude.

## Adding a brand

1. Create `brands/<id>/brand.json` and `brands/<id>/BRAND.md`, using Fossefall's as the
   model.
2. Put its fonts, logo SVGs and images under `public/brands/<id>/`.
3. Create `knowledge/<id>/` with at least one entry.

## Before anyone else uses this

- **There is no sign-in.** Anyone who can reach the app can create and edit decks, and
  anyone with a deck's link can read it. Run it locally, or behind your own access
  control, until accounts are added.
- **Decks are files on one machine.** Move `src/lib/deck/store.ts` to a database before
  hosting.
- **Agent runs live in the web server's process.** A restart interrupts a run in
  progress. Hosting needs a long-running server (not a serverless function) or a
  separate worker.
- **Keep this repository private** while it holds client knowledge and brand files.

## Fossefall: points to confirm

Recorded in `brands/fossefall/BRAND.md` and `knowledge/fossefall/_index.md`:

- The guideline's primary-colour page prints hex codes that do not match the swatches
  drawn next to them. The pack uses the colours as drawn.
- The template's navy and sand-gold pairing is not named in the guideline. It is the
  default palette here, called `fjord`.
- The "S" pattern on the closing slide is an approximation of the guideline's artwork.
- All knowledge-base entries are marked `draft` until someone at Fossefall checks them.
