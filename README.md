# Accesso

An agent that plans, writes and designs presentations in a brand's style and publishes
each one as a responsive web page.

First brand: **Fossefall**.

## What works today

- **Home.** Describe a presentation in your own words, with parameters for slide
  count, palette, audience, goal and tone, or start from one of the brand's example
  briefs. Your presentations are listed underneath as tiles.
- **Presentation.** The deck fills the screen and updates as the agent works. Under it
  are the list of slides and a prompt bar: ask for a change to the whole deck or only
  the slide in view, or switch palette at once. One line above the prompt bar says what
  the agent is doing or last did.
- **Top bar.** The logo goes home. The arrow beside the title switches presentation,
  starts a new one or opens the knowledge base; the title can be renamed in place. On
  the right: desktop or phone size, History, Share (copies the link), open in a new tab,
  and the profile menu (your name and the brand).
- **History.** The conversation with the agent slides in from the right: your requests,
  the steps the agent took (searches, sources read, slides written), its replies and
  its suggestions, each with an Apply button.
- **Knowledge base.** What the agent knows about the brand: search it the way the agent
  does, read and edit entries, mark them draft or verified, add new ones by typing or
  uploading a `.md` or `.txt` file, and see which presentations cite each entry.
  Sources the agent read link straight to their entry.
- **Design system.** The brand the agent designs with: logo, colour palettes, fonts, images,
  brand rules and example briefs. Colours and text are edited on the page and saved together;
  logo, font and image files are uploaded or removed one at a time. Uploaded logos are
  rebuilt from safe drawing parts only, and fonts and images are checked by their contents.

The same layout works on phones, where the deck is shown at phone size.

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
plugin/                the Claude plugin; its content-flow and deck-review skills are shared with the app
src/lib/agent/skills/  deck-design: how the app's agent writes slides in the deck format
data/decks/            one JSON file per deck, including its conversation
src/lib/deck/          the deck format (schema.ts) and file store
src/lib/agent/         the agent: its tools, prompts and the Claude Agent SDK run loop
src/components/        the deck renderer (DeckView.tsx, deck.css)
src/components/workspace/  the app screens (shell, history, knowledge base, design system)
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

**Skills are plain files.** Three skills (content flow and review from `plugin/skills`, deck design from `src/lib/agent/skills`) are loaded into the
agent's instructions on every run, together with the brand's `BRAND.md`. The `plugin`
folder is also a valid Claude plugin, so the same skills can be installed in Claude.

## Using it inside Claude

For the internal team, the same method runs inside Claude with no app to host. The
`plugin/` folder is a Claude plugin with four skills: `new-deck`, `add-client`,
`content-flow` and `deck-review`. Each client has a Design System in Claude (the brand)
and a Google Drive folder at `Accesso knowledge / <Client name>` (the facts). See
`plugin/README.md`. To package it: `cd plugin && zip -r ../accesso.plugin .`

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
