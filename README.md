# Accesso

An agent that plans, writes and designs presentations in a brand's style and publishes
each one as a responsive web page.

First brand: **Fossefall**.

## What works today

The app is one screen in three columns, like a chat app:

- **Projects (left).** Every presentation, grouped by when it was last worked on, with a
  dot showing whether it is ready, being worked on or needs attention. On narrower
  screens this becomes a drawer behind the menu button.
- **Conversation (middle).** Start a deck by describing it in your own words, with
  parameters for slide count, palette, audience, goal and tone, or begin from one of the
  brand's example briefs. The agent's replies show the steps it took (searches, sources
  read, slides written) and end with suggestions you can apply with one click. Ask for
  further changes in the message box, for the whole deck or only the slide in view.
  The palette switches immediately, without waiting for the agent, and the deck title
  can be renamed in place.
- **Presentation (right).** The main view: the live deck, updated as the agent works,
  shown as a desktop or a phone would see it, with a clickable list of slides, a link to
  copy and an Open button. On a phone, Chat and Preview are tabs.
- **Collapsing.** The projects and conversation columns each fold down to a slim strip
  (the « buttons); click the strip to open it again. **Focus** above the presentation
  folds both at once. Drag the divider between two columns to resize them (double-click
  it to reset); dragging a column well below its minimum width collapses it. The layout is remembered between visits.

- **Knowledge base.** The button under "New presentation" opens what the agent knows
  about the brand: search it the way the agent does, read and edit entries, mark them
  draft or verified, add new ones by typing or uploading a `.md` or `.txt` file, and see
  which presentations cite each entry. Sources the agent read in a conversation link
  straight to their entry.

Each deck also has its own page at `/d/<id>`: it pages through slides on a wide screen
and reflows each slide into a single column on a phone.

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
`/studio/sample-fossefall` (or on its own at `/d/sample-fossefall`); creating or editing
a deck will report in the conversation that the key is missing.

In a GitHub Codespace, add the key as a Codespaces secret named `ANTHROPIC_API_KEY`
instead of using `.env.local`.

### Staying up to date

`npm run dev:sync` runs the app and checks GitHub every 30 seconds for a newer version,
applying it automatically. Code changes appear on reload; if new packages are needed it
installs them and restarts. If a file edited locally clashes with an update, it leaves
your files alone and says so.

In a Codespace this starts by itself: opening the codespace installs packages, starts
the app in sync mode and opens it in the browser (see `.devcontainer/devcontainer.json`).
A codespace created before that file existed picks it up after
**Codespaces: Rebuild Container** from the command palette (Cmd/Ctrl+Shift+P).

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
data/decks/            one JSON file per deck, including its conversation
src/lib/deck/          the deck format (schema.ts) and file store
src/lib/agent/         the agent: its tools, prompts and the Claude Agent SDK run loop
src/components/        the deck renderer (DeckView.tsx, deck.css)
src/components/workspace/  the three-column app screen
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
