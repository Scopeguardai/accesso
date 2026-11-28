# Accesso plugin for Claude

Lets the team make brand-true presentations for any client inside Claude.

## Skills

| Skill | Use it to |
| --- | --- |
| `new-deck` | Make or revise a deck for a named client |
| `add-client` | Set up a new client: Design System and knowledge folder |
| `content-flow` | Plan the story from a brief and the client's knowledge (used by new-deck) |
| `deck-review` | Review a deck against the brief and the brand (used by new-deck) |

## How clients are kept

- **Brand:** one Design System per client in Claude, titled with the client's name.
- **Knowledge:** one Google Drive folder per client at `Accesso knowledge / <Client name>`.
  A document whose title starts with "Draft" is treated as unconfirmed.

Adding a client needs no change to this plugin.

## Requirements

- The Google Drive connector, connected by each person who makes decks.
- Each client's Design System shared with the people who make that client's decks.

## Relation to the Voila app

`content-flow` and `deck-review` are the same files the Voila app's agent uses. The
app's own slide format has a separate `deck-design` skill in `src/lib/agent/skills`.
