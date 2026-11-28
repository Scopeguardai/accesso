import { styleGuidance } from '../knowledge/styles';
import { loadBrand } from '../brand/load';
import { appendThread, finishRun, readDeck, updateDeck } from '../deck/store';
import { ROOT } from '../paths';
import { createDeckTools, TOOL_DESCRIPTIONS, toolShapes, type ToolReply } from './deck-tools';
import { createPrompt, editPrompt, systemPrompt } from './prompt';

const SERVER = 'deck';

export type RunRequest =
  | { deckId: string; mode: 'create' }
  | { deckId: string; mode: 'edit'; request: string; slideId?: string };

/**
 * Decks with an agent run in progress in this process. Kept on globalThis so
 * every route sees the same set even when the bundler duplicates this module.
 */
const store = globalThis as typeof globalThis & { __accessoRunning?: Set<string> };
const running = (store.__accessoRunning ??= new Set<string>());
export const isRunning = (deckId: string) => running.has(deckId);

/**
 * Run the agent against one deck. Resolves when the run ends; the deck file
 * is updated as the agent works, so callers can start this without awaiting
 * it and poll the deck instead.
 */
export async function runAgent(req: RunRequest): Promise<void> {
  const { deckId } = req;
  if (running.has(deckId)) throw new Error('This deck is already being worked on.');
  const deck = readDeck(deckId);
  if (!deck) throw new Error(`Deck ${deckId} not found`);

  running.add(deckId);
  updateDeck(deckId, (d) => {
    d.status = 'generating';
    d.statusNote = undefined;
  });
  appendThread(deckId, { role: 'agent', status: 'working', text: '', steps: [] });

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local (or as a Codespaces secret) and restart the app.');
    }
    const brand = loadBrand(deck.brand);
    const tools = createDeckTools(deckId);
    const sdk = await import('@anthropic-ai/claude-agent-sdk');

    const wrap = (reply: ToolReply) => ({
      content: [{ type: 'text' as const, text: reply.text }],
      isError: !reply.ok,
    });
    const names = Object.keys(toolShapes) as (keyof typeof toolShapes)[];
    const server = sdk.createSdkMcpServer({
      name: SERVER,
      version: '0.1.0',
      tools: names.map((name) =>
        sdk.tool(name, TOOL_DESCRIPTIONS[name], toolShapes[name], async (args) => {
          try {
            // Shapes and handlers are declared side by side in deck-tools.ts.
            return wrap((tools[name] as (a: unknown) => ToolReply)(args));
          } catch (err) {
            return wrap({ ok: false, text: `Tool failed: ${(err as Error).message}` });
          }
        }),
      ),
    });

    const run = sdk.query({
      prompt: req.mode === 'create' ? createPrompt(deck) : editPrompt(deck, req.request, req.slideId),
      options: {
        systemPrompt: systemPrompt(brand, styleGuidance(deck.client, deck.brief.style)),
        model: process.env.ACCESSO_MODEL || undefined,
        cwd: ROOT,
        // The agent gets the deck tools and nothing else: no files, shell or web.
        tools: [],
        mcpServers: { [SERVER]: server },
        allowedTools: names.map((n) => `mcp__${SERVER}__${n}`),
        permissionMode: 'dontAsk',
        settingSources: [],
        persistSession: false,
        maxTurns: Number(process.env.ACCESSO_MAX_TURNS) || 80,
      },
    });

    let summary = '';
    for await (const message of run) {
      if (message.type === 'result') {
        if (message.subtype === 'success') summary = message.result;
        else throw new Error(`The agent stopped early (${message.subtype}).`);
      }
    }

    finishRun(deckId, 'done', summary || 'Done.', 'ready');
  } catch (err) {
    const after = readDeck(deckId);
    // A failed run that still left slides behind leaves a usable deck.
    finishRun(deckId, 'error', (err as Error).message, after && after.slides.length > 0 ? 'ready' : 'error');
  } finally {
    running.delete(deckId);
  }
}
