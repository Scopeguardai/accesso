import { z } from 'zod';
import { imageFor, loadBrand } from '../brand/load';
import {
  formatIssues,
  outlineItemSchema,
  slideSchema,
  suggestionSchema,
  type Slide,
} from '../deck/schema';
import { logActivity, readDeck, updateDeck } from '../deck/store';
import { readKnowledge, searchKnowledge } from '../knowledge/search';

/**
 * Everything the agent can do, as plain functions bound to one deck.
 * They are the agent's only tools: it cannot read files, run commands or
 * reach the network, and it can only change the deck it was started for.
 * Each returns text for the model; `ok: false` marks a rejected call.
 */

export type ToolReply = { ok: boolean; text: string };
const ok = (text: string): ToolReply => ({ ok: true, text });
const fail = (text: string): ToolReply => ({ ok: false, text });

function imagesIn(slide: Slide): string[] {
  const refs: string[] = [];
  if ('image' in slide && slide.image) refs.push(slide.image.asset);
  if ('images' in slide) refs.push(...slide.images.map((i) => i.asset));
  return refs;
}

export const toolShapes = {
  search_knowledge: {
    query: z.string().min(2).describe('Keywords to look for'),
    limit: z.number().int().min(1).max(10).optional(),
  },
  read_knowledge: {
    path: z.string().describe('Path returned by search_knowledge, e.g. "fossefall/positioning.md"'),
  },
  get_deck: {},
  set_deck: {
    title: z.string().min(1).max(120).optional(),
    palette: z.string().optional().describe('A palette name from the brand'),
  },
  set_outline: { outline: z.array(outlineItemSchema).min(2).max(20) },
  upsert_slide: {
    slide: slideSchema,
    afterId: z
      .string()
      .optional()
      .describe('For a new slide: id of the slide it follows. "start" puts it first. Omit to append.'),
  },
  remove_slide: { id: z.string() },
  reorder_slides: { ids: z.array(z.string()).min(1).describe('Every slide id, in the new order') },
  set_suggestions: { suggestions: z.array(suggestionSchema).max(5) },
};

export function createDeckTools(deckId: string) {
  const deck = () => {
    const d = readDeck(deckId);
    if (!d) throw new Error(`Deck ${deckId} not found`);
    return d;
  };
  const brand = () => loadBrand(deck().brand);

  return {
    search_knowledge({ query, limit }: { query: string; limit?: number }): ToolReply {
      const hits = searchKnowledge(deck().client, query, limit ?? 5);
      logActivity(deckId, `Searched knowledge base: "${query}" (${hits.length} found)`);
      if (hits.length === 0) return ok(`No knowledge-base entries match "${query}".`);
      return ok(
        hits
          .map(
            (h) =>
              `path: ${h.path}\ntitle: ${h.title}\nstatus: ${h.status || 'unknown'}\nsource: ${h.source}\nexcerpt: ${h.snippet}`,
          )
          .join('\n\n'),
      );
    },

    read_knowledge({ path }: { path: string }): ToolReply {
      const entry = readKnowledge(deck().client, path);
      if (!entry) return fail(`No knowledge-base entry at "${path}". Use a path from search_knowledge.`);
      logActivity(deckId, `Read ${entry.path}`);
      return ok(
        `path: ${entry.path}\ntitle: ${entry.title}\nstatus: ${entry.status || 'unknown'}\nsource: ${entry.source}\nupdated: ${entry.updated}\n\n${entry.body}`,
      );
    },

    get_deck(): ToolReply {
      const d = deck();
      return ok(
        JSON.stringify(
          { title: d.title, palette: d.palette, brief: d.brief, outline: d.outline, slides: d.slides, suggestions: d.suggestions },
          null,
          1,
        ),
      );
    },

    set_deck({ title, palette }: { title?: string; palette?: string }): ToolReply {
      if (palette && !brand().palettes[palette]) {
        return fail(`Unknown palette "${palette}". Available: ${Object.keys(brand().palettes).join(', ')}.`);
      }
      updateDeck(deckId, (d) => {
        if (title) d.title = title;
        if (palette) d.palette = palette;
      });
      if (palette) logActivity(deckId, `Palette set to ${palette}`);
      return ok('Deck updated.');
    },

    set_outline({ outline }: { outline: unknown }): ToolReply {
      const parsed = z.array(outlineItemSchema).min(2).max(20).safeParse(outline);
      if (!parsed.success) return fail(`Outline rejected:\n${formatIssues(parsed.error)}`);
      updateDeck(deckId, (d) => {
        d.outline = parsed.data;
      });
      logActivity(deckId, `Outline written (${parsed.data.length} slides)`);
      return ok(`Outline saved with ${parsed.data.length} slides.`);
    },

    upsert_slide({ slide, afterId }: { slide: unknown; afterId?: string }): ToolReply {
      const parsed = slideSchema.safeParse(slide);
      if (!parsed.success) {
        return fail(`Slide rejected. Fix these and call again:\n${formatIssues(parsed.error)}`);
      }
      const next = parsed.data;
      const b = brand();
      const unknownImages = imagesIn(next).filter((a) => !imageFor(b, a));
      if (unknownImages.length) {
        return fail(
          `Unknown image id(s): ${unknownImages.join(', ')}. Available: ${b.images.map((i) => i.id).join(', ')}.`,
        );
      }
      const client = deck().client;
      const badSources = (next.sources ?? []).filter((s) => !readKnowledge(client, s));
      if (badSources.length) {
        return fail(`These sources are not knowledge-base paths: ${badSources.join(', ')}.`);
      }

      let outcome = '';
      let rejected = '';
      updateDeck(deckId, (d) => {
        const existing = d.slides.findIndex((s) => s.id === next.id);
        if (existing >= 0) {
          d.slides[existing] = next;
          outcome = `Slide "${next.id}" replaced at position ${existing + 1}.`;
          return;
        }
        if (afterId === 'start') {
          d.slides.unshift(next);
        } else if (afterId) {
          const at = d.slides.findIndex((s) => s.id === afterId);
          if (at < 0) {
            rejected = `No slide with id "${afterId}" to insert after.`;
            return;
          }
          d.slides.splice(at + 1, 0, next);
        } else {
          d.slides.push(next);
        }
        outcome = `Slide "${next.id}" added. The deck has ${d.slides.length} slides.`;
      });
      if (rejected) return fail(rejected);
      logActivity(deckId, `Slide "${next.id}" saved (${next.layout})`);
      return ok(outcome);
    },

    remove_slide({ id }: { id: string }): ToolReply {
      let found = false;
      updateDeck(deckId, (d) => {
        const at = d.slides.findIndex((s) => s.id === id);
        if (at >= 0) {
          d.slides.splice(at, 1);
          found = true;
        }
      });
      if (!found) return fail(`No slide with id "${id}".`);
      logActivity(deckId, `Slide "${id}" removed`);
      return ok(`Slide "${id}" removed.`);
    },

    reorder_slides({ ids }: { ids: string[] }): ToolReply {
      const current = deck().slides.map((s) => s.id);
      const same = ids.length === current.length && [...ids].sort().join() === [...current].sort().join();
      if (!same) return fail(`ids must list every slide exactly once. Current ids: ${current.join(', ')}.`);
      updateDeck(deckId, (d) => {
        d.slides = ids.map((i) => d.slides.find((s) => s.id === i)!);
      });
      logActivity(deckId, 'Slides reordered');
      return ok('Slides reordered.');
    },

    set_suggestions({ suggestions }: { suggestions: unknown }): ToolReply {
      const parsed = z.array(suggestionSchema).max(5).safeParse(suggestions);
      if (!parsed.success) return fail(`Suggestions rejected:\n${formatIssues(parsed.error)}`);
      updateDeck(deckId, (d) => {
        d.suggestions = parsed.data;
      });
      logActivity(deckId, `${parsed.data.length} suggestion(s) recorded`);
      return ok('Suggestions saved.');
    },
  };
}

export const TOOL_DESCRIPTIONS: Record<keyof typeof toolShapes, string> = {
  search_knowledge:
    "Search this client's knowledge base. Returns matching entries with their path, status and an excerpt. Search before writing any factual content.",
  read_knowledge: 'Read one knowledge-base entry in full.',
  get_deck: 'Return the current deck: title, palette, brief, outline, slides and suggestions.',
  set_deck: "Change the deck's title or palette.",
  set_outline: 'Save the planned outline, one entry per slide. Call once before writing slides.',
  upsert_slide:
    'Add a slide, or replace the slide that has the same id. The slide is checked against the format, the image library and the knowledge base; a rejected call explains what to fix.',
  remove_slide: 'Delete a slide by id.',
  reorder_slides: 'Put the slides in a new order.',
  set_suggestions: 'Replace the list of suggestions shown to the person. At most five.',
};
