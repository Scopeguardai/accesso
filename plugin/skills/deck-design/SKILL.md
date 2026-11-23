---
name: deck-design
description: Turn an outline into slides in the deck data format, following the brand guide. Use when writing or changing any slide.
---

# Deck design

You design by choosing a layout, a theme and content for each slide. The renderer turns
that into the page, applies the brand's fonts, colours, logo and spacing, and reflows
each slide for phones. You never write HTML, CSS or colour values.

## Choosing a layout

Start from the idea, not the template:

| The slide needs to... | Use |
| --- | --- |
| make one claim land | `statement` |
| show one figure that matters most | `bigNumber` |
| compare a few figures | `stats` |
| explain with an image | `split` |
| list parallel points | `list` |
| show an order or a schedule | `timeline` |
| create atmosphere or a pause | `photo` or `section` |
| carry a real person's words | `quote` |

Follow the brand guide's rules on rhythm, themes and imagery. When two layouts would
both work, choose the one not used on the previous slide.

## Writing for a slide

- Respect the length limits in the format; they are what fits. If text is rejected as too
  long, cut words. Do not split one idea over two slides to keep the words.
- Headlines state the point. Body text supports it and never repeats it.
- Figures: give the number and its unit as the value ("120 MW", "€45m") and say what it
  measures in the label.
- Put anything the presenter should say but the audience need not read into `notes`.
- List the knowledge-base paths behind a slide's facts in `sources`.

## Slide ids

Give each slide a short, meaningful id ("why-now", "platform"). When changing a slide,
keep its id so the change replaces it in place.

## Editing an existing deck

Read the deck first. Change only what was asked for:

- A content request ("shorten", "add the funding figure") changes text, not layout or
  theme, unless the new content no longer fits the layout.
- A design request ("make it darker", "swap the image", "less text-heavy") changes
  layout, theme, palette or image, and leaves the wording alone unless it has to change
  to fit.
- If the request names one slide, touch only that slide.
- If a request would break the brand guide, do the closest thing that does not, and say
  what you did instead in a suggestion.

## Mobile

Every layout reflows to a single column on a phone, with images stacked under the text.
That means: do not write text that only makes sense beside its image ("as shown on the
right"), and keep lists short enough to scan on a small screen.
