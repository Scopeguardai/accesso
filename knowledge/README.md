# Knowledge base

Plain Markdown the deck agent searches before it writes a slide. Text only.

You can manage entries in the app (the **Knowledge base** button in the left column) or
edit these files directly; both work on the same files. Entries added in the app are
saved here, so commit them to keep them.

## Layout

```
knowledge/
  <client>/            one folder per client; an agent run only sees its own client's folder
    _index.md          human overview of what is in the folder (ignored by search)
    <topic>.md         one topic per file
```

## One file per topic

Keep files short and focused: a product, a case study, a set of figures, a biography.
The agent finds files by title, tags and body text, then cites the file path on each
slide that uses it.

```markdown
---
title: Platform strategy
tags: [strategy, platform, compute]
source: Board deck, March 2026, slide 7
updated: 2026-03-14
status: verified
---

The text the agent may use. Write facts as plain sentences with their numbers and dates.
```

Header fields:

- `title`: what the file is about. Weighted most in search.
- `tags`: comma-separated keywords.
- `source`: where the text came from, so a reviewer can check it.
- `updated`: date last checked (YYYY-MM-DD).
- `status`: `verified` or `draft`. The agent treats `draft` text as unconfirmed and
  raises a suggestion to check it.

## Rules

- A brief overrides the knowledge base. If the two disagree, the agent follows the brief
  and flags the conflict.
- Nothing in here is public by default. Keep this repository private, and never put one
  client's material in another client's folder.
- Files whose names start with `_` are for people, not for search.
