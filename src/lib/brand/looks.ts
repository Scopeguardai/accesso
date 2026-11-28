import { z } from 'zod';

/**
 * Deck designs. A "look" is a complete design for all thirteen slide layouts:
 * where the logo and page number sit, how headings and details are set, how
 * pictures are shaped, how the cover and closing are composed. Colours, fonts
 * and logo still come from the brand. No file system access here, so the
 * browser can use it too.
 */

export const LOOKS = ['clean', 'editorial', 'bold', 'corporate', 'nordic'] as const;
export type Look = (typeof LOOKS)[number];

export const COVERS = ['dark', 'light', 'accent'] as const;
export const CORNERS = ['square', 'soft', 'round'] as const;
export const HEADINGS = ['light', 'medium', 'heavy'] as const;

export type Design = {
  look: Look;
  /** The background of the cover and closing slides. */
  cover: (typeof COVERS)[number];
  /** How pictures and tiles are cornered. */
  corners: (typeof CORNERS)[number];
  /** How heavy headings are set. */
  headings: (typeof HEADINGS)[number];
};

export const LOOK_INFO: Record<Look, { name: string; text: string; defaults: Omit<Design, 'look'> }> = {
  clean: {
    name: 'Clean',
    text: 'A quiet, modern design. Small logo top left, medium-weight headings, left-aligned cover.',
    defaults: { cover: 'light', corners: 'soft', headings: 'medium' },
  },
  editorial: {
    name: 'Editorial',
    text: 'Magazine-like. A thin rule across the top, large light headings, generous space, square pictures.',
    defaults: { cover: 'light', corners: 'square', headings: 'light' },
  },
  bold: {
    name: 'Bold',
    text: 'Confident and graphic. Heavy headings, a bar of the accent colour, figures in filled tiles, round corners.',
    defaults: { cover: 'accent', corners: 'round', headings: 'heavy' },
  },
  corporate: {
    name: 'Corporate',
    text: 'Classic and orderly. Logo and page number in a footer, underlined headings, centred cover.',
    defaults: { cover: 'dark', corners: 'square', headings: 'medium' },
  },
  nordic: {
    name: 'Nordic',
    text: 'A white strip down the left edge with the symbol and sideways logo, light headings, typewriter details.',
    defaults: { cover: 'dark', corners: 'square', headings: 'light' },
  },
};

/** What a brand file may say about its design. Every part is optional. */
export const designChoiceSchema = z.object({
  look: z.enum(LOOKS).optional(),
  cover: z.enum(COVERS).optional(),
  corners: z.enum(CORNERS).optional(),
  headings: z.enum(HEADINGS).optional(),
});
export type DesignChoice = z.infer<typeof designChoiceSchema>;

/** The look for a brand that has not chosen one. */
export const DEFAULT_LOOK: Look = 'clean';

export function resolveDesign(choice: DesignChoice | undefined): Design {
  const look = choice?.look ?? DEFAULT_LOOK;
  const d = LOOK_INFO[look].defaults;
  return { look, cover: choice?.cover ?? d.cover, corners: choice?.corners ?? d.corners, headings: choice?.headings ?? d.headings };
}
