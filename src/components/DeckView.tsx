import type { CSSProperties, ReactNode } from 'react';
import { cssFontFormat } from '@/lib/brand/assets';
import { imageFor, paletteFor, type Brand } from '@/lib/brand/load';
import { DEFAULT_THEME, type Deck, type ImageRef, type Slide } from '@/lib/deck/schema';
import DeckNav from './DeckNav';

/**
 * Draws a deck. Everything visual about the brand comes from the brand pack
 * (fonts, palette, logo, images); everything about the content comes from
 * the deck data. Layout and responsive behaviour live in deck.css.
 */

type Ctx = { brand: Brand; index: number };

function Img({ image, ctx, className }: { image: ImageRef; ctx: Ctx; className?: string }) {
  const asset = imageFor(ctx.brand, image.asset);
  if (!asset) return <div className={`img-missing ${className ?? ''}`}>Image removed from the library</div>;
  return (
    <img
      className={className}
      src={`${ctx.brand.assetBase}/${asset.file}`}
      alt={image.alt ?? asset.alt}
      data-orientation={asset.orientation}
      loading={ctx.index < 2 ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

const Svg = ({ markup, className }: { markup: string; className: string }) => (
  <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
);

const Label = ({ children }: { children?: ReactNode }) =>
  children ? <p className="label">{children}</p> : null;

function body(slide: Slide, ctx: Ctx): { bleed?: ReactNode; content: ReactNode } {
  const { brand } = ctx;
  switch (slide.layout) {
    case 'cover':
      return {
        content: (
          <>
            <h1 className="cover-logo">
              <Svg markup={brand.svg.wordmark} className="logo" />
              <span className="sr-only">{brand.name}</span>
            </h1>
            {slide.title && <p className="cover-title">{slide.title}</p>}
            <p className="cover-sub">{slide.subtitle ?? brand.tagline}</p>
          </>
        ),
      };
    case 'agenda':
      return {
        bleed: slide.image && <Img image={slide.image} ctx={ctx} className="bleed" />,
        content: (
          <>
            <h2 className="agenda-title">{slide.title}</h2>
            <ol className="agenda-items">
              {slide.items.map((item, i) => (
                <li key={i}>
                  <span className="agenda-item">{item.title}</span>
                  {item.note && <span className="mono">{item.note}</span>}
                </li>
              ))}
            </ol>
          </>
        ),
      };
    case 'section':
      return {
        content: (
          <>
            <div className="section-top">
              {slide.image && (
                <div className="section-art">
                  <Img image={slide.image} ctx={ctx} />
                </div>
              )}
              {slide.body && <p className="section-body mono">{slide.body}</p>}
            </div>
            <div>
              <Label>{slide.label}</Label>
              <h2 className="display">{slide.title}</h2>
            </div>
          </>
        ),
      };
    case 'statement':
      return {
        content: (
          <>
            <div>
              <Label>{slide.label}</Label>
              <h2 className="h1">{slide.heading}</h2>
              {slide.body && <p className="lead">{slide.body}</p>}
            </div>
            {slide.stat && (
              <p className="stat stat-xl">
                <span className="stat-value">{slide.stat.value}</span>
                <span className="mono">{slide.stat.label}</span>
              </p>
            )}
          </>
        ),
      };
    case 'split':
      return {
        content: (
          <>
            <div className="split-text">
              <Label>{slide.label}</Label>
              <h2 className="h2">{slide.heading}</h2>
              {slide.body && <p className="text">{slide.body}</p>}
              {slide.bullets && slide.bullets.length > 0 && (
                <ul className="bullets">
                  {slide.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="split-media">
              <Img image={slide.image} ctx={ctx} />
            </div>
          </>
        ),
      };
    case 'stats':
      return {
        content: (
          <>
            <div>
              <Label>{slide.label}</Label>
              <h2 className="h2">{slide.heading}</h2>
              {slide.body && <p className="text">{slide.body}</p>}
            </div>
            <dl className="stats-row" data-count={slide.stats.length}>
              {slide.stats.map((s, i) => (
                <div className="stat" key={i}>
                  <dd className="stat-value">{s.value}</dd>
                  <dt className="mono">{s.label}</dt>
                  {s.note && <dd className="small">{s.note}</dd>}
                </div>
              ))}
            </dl>
          </>
        ),
      };
    case 'list':
      return {
        content: (
          <>
            <div>
              <Label>{slide.label}</Label>
              <h2 className="h2">{slide.heading}</h2>
            </div>
            <ol className="rows">
              {slide.items.map((item, i) => (
                <li key={i}>
                  <span className="mono rows-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="rows-title">{item.title}</span>
                  <span className="small">{item.body}</span>
                </li>
              ))}
            </ol>
          </>
        ),
      };
    case 'quote':
      return {
        content: (
          <figure className="quote">
            <span className="quote-mark" aria-hidden="true">
              &ldquo;
            </span>
            <blockquote>{slide.quote}</blockquote>
            {(slide.name || slide.role) && (
              <figcaption>
                {slide.name && <span className="quote-name">{slide.name}</span>}
                {slide.role && <span className="mono">{slide.role}</span>}
              </figcaption>
            )}
          </figure>
        ),
      };
    case 'gallery':
      return {
        content: (
          <>
            <div className="split-text">
              <Label>{slide.label}</Label>
              <h2 className="h2">{slide.heading}</h2>
              {slide.body && <p className="text">{slide.body}</p>}
            </div>
            <div className="mosaic" data-count={slide.images.length}>
              {slide.images.map((image, i) => (
                <Img key={i} image={image} ctx={ctx} />
              ))}
            </div>
          </>
        ),
      };
    case 'timeline':
      return {
        content: (
          <>
            <div>
              <Label>{slide.label}</Label>
              <h2 className="h2">{slide.heading}</h2>
              {slide.body && <p className="text">{slide.body}</p>}
            </div>
            <ol className="timeline" data-count={slide.steps.length}>
              {slide.steps.map((step, i) => (
                <li key={i}>
                  <span className="mono">{step.label}</span>
                  <span className="timeline-dot" aria-hidden="true" />
                  <span className="rows-title">{step.title}</span>
                  {step.body && <span className="small">{step.body}</span>}
                </li>
              ))}
            </ol>
          </>
        ),
      };
    case 'bigNumber':
      return {
        content: (
          <>
            <p className="big-value">{slide.value}</p>
            <div className="big-foot">
              <p className="big-caption mono">{slide.caption}</p>
              {slide.body && <p className="small">{slide.body}</p>}
            </div>
          </>
        ),
      };
    case 'photo':
      return {
        bleed: <Img image={slide.image} ctx={ctx} className="bleed" />,
        content: (
          <div>
            {slide.kicker && <p className="photo-kicker">{slide.kicker}</p>}
            <h2 className="photo-title">{slide.title}</h2>
          </div>
        ),
      };
    case 'closing':
      return {
        bleed: <span className="pattern" aria-hidden="true" />,
        content: (
          <>
            <Svg markup={brand.svg.wordmark} className="logo closing-logo" />
            <h2 className="closing-title">{slide.title}</h2>
            {slide.contacts && slide.contacts.length > 0 && (
              <ul className="contacts">
                {slide.contacts.map((c, i) => (
                  <li key={i} className="mono">
                    <span className="contacts-label">{c.label}</span> {c.value}
                  </li>
                ))}
              </ul>
            )}
          </>
        ),
      };
  }
}

function SlideView({ slide, brand, index }: { slide: Slide; brand: Brand; index: number }) {
  const theme = slide.theme ?? DEFAULT_THEME[slide.layout];
  const { bleed, content } = body(slide, { brand, index });
  return (
    <section
      id={slide.id}
      className={`slide t-${theme} l-${slide.layout}`}
      data-side={slide.layout === 'split' ? slide.imageSide : undefined}
      data-bleed={bleed && slide.layout !== 'closing' ? '' : undefined}
      aria-label={`Slide ${index + 1}`}
    >
      {bleed}
      <div className="rail">
        <Svg markup={brand.svg.mark} className="rail-mark" />
        <Svg markup={brand.svg.wordmark} className="rail-word" />
        <span className="rail-copy mono">{brand.copyright}</span>
      </div>
      <div className="stage">{content}</div>
      <span className="pageno mono">{index + 1}</span>
    </section>
  );
}

export default function DeckView({ deck, brand }: { deck: Deck; brand: Brand }) {
  const p = paletteFor(brand, deck.palette);
  const font = (f: Brand['fonts']['sans']) =>
    `@font-face{font-family:"${f.family}";src:url("${brand.assetBase}/${f.file}") format("${cssFontFormat(f.file)}");font-weight:${f.weight};font-display:swap}`;
  const vars = {
    '--sans': `"${brand.fonts.sans.family}", system-ui, sans-serif`,
    '--mono': `"${brand.fonts.mono.family}", ui-monospace, monospace`,
    '--c-dark': p.dark,
    '--c-on-dark': p.onDark,
    '--c-accent': p.accent,
    '--c-on-accent': p.onAccent,
    '--c-light': p.light,
    '--c-paper': p.paper,
    '--c-tint': p.tint,
    '--c-ink': p.ink,
    '--c-muted': p.muted,
    '--c-line': p.line,
  } as CSSProperties;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: font(brand.fonts.sans) + font(brand.fonts.mono) }} />
      <main className="deck" style={vars} data-status={deck.status}>
        {deck.slides.map((slide, i) => (
          <SlideView key={slide.id} slide={slide} brand={brand} index={i} />
        ))}
        {deck.slides.length === 0 && (
          <section className="deck-empty">
            <p>{deck.status === 'generating' ? 'The first slides are on their way.' : 'This deck has no slides yet.'}</p>
          </section>
        )}
      </main>
      <DeckNav count={deck.slides.length} />
    </>
  );
}
