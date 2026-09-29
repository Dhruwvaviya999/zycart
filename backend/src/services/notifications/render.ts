/**
 * One branded shell, and the escaping that makes it safe to put data in.
 *
 * ## Why the layout is here and not in each template
 *
 * Four templates, one shell. The alternative — a complete HTML document in each
 * template — was rejected for the ordinary reason (a branding change means four
 * edits) and for a much less ordinary one: every copy would be a separate place
 * to forget an `escapeHtml`. With one renderer, escaping is applied in one
 * function, to every value, and a template physically cannot emit raw markup
 * because templates return *data*, not strings of HTML.
 *
 * That is the security design of this file. `EmailContent` has no field whose
 * contents are treated as HTML. A product called
 * `<img src=x onerror=alert(1)>` renders as those characters, visibly, in the
 * customer's mail client, because the only path from data to document goes
 * through `escapeHtml`.
 *
 * ## Why the HTML looks like 2004
 *
 * Because mail clients do. Outlook on Windows renders with Word's engine, Gmail
 * strips `<style>` blocks in some contexts and rewrites others, and no client
 * can be relied on for flexbox, grid, custom properties or web fonts. So:
 * tables for structure, inline styles for everything, a system font stack, no
 * JavaScript, no external assets, and a single column that is readable at
 * 320px because it never needs to be anything else.
 *
 * ## Dark mode
 *
 * Not attempted. Client support for `prefers-color-scheme` in mail ranges from
 * full to a forced inversion of whatever the message specified, and a design
 * that depends on being asked first will be wrong in the clients that do not
 * ask. The palette below is therefore light with high-contrast text, so it
 * stays legible whether it is rendered as sent or inverted by the client.
 */

/** The brand, as an email can express it. Hex only: `oklch()` is not supported. */
const PALETTE = {
  page: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
  ink: '#18181b',
  muted: '#52525b',
  faint: '#71717a',
  brand: '#5152de',
  brandInk: '#ffffff',
  brandSubtle: '#ebefff',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/* ---------------------------------------------------------------- */
/* Escaping                                                          */
/* ---------------------------------------------------------------- */

/**
 * The only route from data into the document.
 *
 * All five characters, including both quote forms: values land inside `href="…"`
 * as well as between tags, and escaping only `<` and `&` leaves an attribute
 * breakable by a single quote. `&` is replaced first, or the replacement would
 * re-escape the escapes.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A value safe to use in a subject line.
 *
 * Header injection is the attack this closes: a newline in a subject ends the
 * header and begins another, which is how a crafted value turns into an extra
 * `Bcc:`. Nodemailer encodes headers itself and would not pass one through, but
 * a subject is assembled here and stored here, so it is normalised here too
 * rather than relying on a library's behaviour never changing.
 *
 * Control characters and format characters go, whitespace collapses, and the
 * result is bounded. Subjects in this phase interpolate only server-generated
 * references in any case; this is the belt to that braces.
 */
export function sanitizeSubject(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

/**
 * An off-site link, or nothing.
 *
 * Only `https:` survives. `javascript:`, `data:`, `vbscript:` and every other
 * scheme return null and the caller renders no link at all — which is the
 * honest outcome, because a tracking URL ZyCart cannot vouch for is a tracking
 * URL it should not put its name behind.
 *
 * Phase 13's validator already enforces this when an operator types the value.
 * It is enforced again here because a delivery record can be retried months
 * later, the rules may have been looser when the row was written, and "it was
 * validated on the way in" is the assumption every stored-XSS bug is built on.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- */
/* The content contract                                              */
/* ---------------------------------------------------------------- */

/** One label/value row in the summary card. Both are plain text. */
export interface EmailFact {
  label: string;
  value: string;
}

/** One line of an order or return, summarised. */
export interface EmailLineItem {
  name: string;
  /** "Size 9 · Black", or empty. */
  variant: string;
  quantity: number;
}

export interface EmailAction {
  label: string;
  url: string;
}

/**
 * What a template produces.
 *
 * Every string here is plain text and is escaped by the renderer. There is
 * deliberately no `html` field, no `raw` field and no way for a template to
 * contribute markup — the shell owns the document, and a template owns what it
 * says.
 */
export interface EmailContent {
  /** The line a mail client shows beside the subject. One sentence, never the whole message. */
  preview: string;
  heading: string;
  greeting: string;
  /** The message itself. Short paragraphs; this is not a letter. */
  paragraphs: string[];
  facts: EmailFact[];
  items?: { lines: EmailLineItem[]; hiddenCount: number };
  primary?: EmailAction;
  secondary?: EmailAction;
  /** Supporting detail under the buttons. Optional, and usually one line. */
  notes?: string[];
  /**
   * Why this person is receiving this message, when it is not about an order.
   *
   * Absent for the four Phase 14 messages, which keep the order wording. From
   * Phase 18 not every message is about an order — a password reset, a
   * newsletter confirmation, a cart reminder — and a footer claiming "you
   * placed this order with us" under any of them would be false in writing.
   */
  footer?: EmailFooter;
}

export interface EmailFooter {
  /** One sentence: "You are receiving this because…". Plain text. */
  reason: string;
  /**
   * Whether to link to the account. False for a newsletter address, whose
   * owner may well have no account to link to.
   */
  showAccountLink?: boolean;
  /** A one-click way to stop this kind of message, where one exists. */
  optOut?: EmailAction;
}

/** The footer every message had before Phase 18, and the order messages still have. */
const ORDER_FOOTER: EmailFooter = {
  reason:
    'This is a service message about your ZyCart order. You are receiving it because you ' +
    'placed this order with us.',
  showAccountLink: true,
};

/** The deployment's identity, resolved from configuration. */
export interface EmailBrand {
  /** `https://zycart.example`, with no trailing slash. */
  appOrigin: string;
  /** A real, monitored support address, or null. Never invented. */
  supportEmail: string | null;
  accountUrl: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/* ---------------------------------------------------------------- */
/* The shell                                                         */
/* ---------------------------------------------------------------- */

/**
 * The preheader: the grey line a client prints after the subject.
 *
 * Hidden in the body, then padded with zero-width non-joiners so the client
 * does not continue into the heading and print "Your order has shipped Your
 * order has shipped". The padding is the standard trick and it is ugly; the
 * alternative is a preview line that reads as a stutter.
 */
function preheader(text: string): string {
  const padding = '&#8204;&nbsp;'.repeat(60);

  return (
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;` +
    `font-size:1px;line-height:1px;color:${PALETTE.page};opacity:0;">` +
    `${escapeHtml(text)}${padding}</div>`
  );
}

/** The wordmark. Type rather than an image: a blocked image is a blank header. */
function masthead(): string {
  return (
    `<tr><td style="padding:26px 24px 6px 24px;">` +
    `<span style="font-family:${FONT_STACK};font-size:20px;font-weight:700;` +
    `letter-spacing:-0.02em;color:${PALETTE.ink};">Zy</span>` +
    `<span style="font-family:${FONT_STACK};font-size:20px;font-weight:700;` +
    `letter-spacing:-0.02em;color:${PALETTE.brand};">Cart</span>` +
    `</td></tr>`
  );
}

function paragraphHtml(text: string, color: string = PALETTE.muted): string {
  return (
    `<p style="margin:0 0 14px 0;font-family:${FONT_STACK};font-size:15px;` +
    `line-height:1.6;color:${color};">${escapeHtml(text)}</p>`
  );
}

/**
 * The summary card.
 *
 * ## Why the padding is on the cells and not on the table
 *
 * A table is `content-box`, so `padding:16px` on a `width:100%` table is 100%
 * *plus* 32px. Nothing here actually overflows at 320px — `word-break` on the
 * value lets the whole card shrink — but the inset on the table raises the
 * narrowest width this block can be drawn at for no reason, and the margin it
 * eats is margin a long tracking number needs. Putting the inset on the first
 * and last cell of each row keeps the table exactly as wide as the space it was
 * given.
 *
 * `white-space:nowrap` is on the label only. A label is two words; a value can
 * be a tracking number long enough to need breaking, and that is what
 * `word-break` is for — it is what makes this card fit a 320px screen at all.
 */
function factsHtml(facts: EmailFact[]): string {
  if (facts.length === 0) return '';

  const rows = facts
    .map(
      (fact) =>
        `<tr>` +
        `<td style="padding:9px 8px 9px 16px;font-family:${FONT_STACK};font-size:13px;` +
        `color:${PALETTE.faint};white-space:nowrap;vertical-align:top;">${escapeHtml(fact.label)}</td>` +
        `<td style="padding:9px 16px 9px 8px;font-family:${FONT_STACK};font-size:14px;` +
        `font-weight:600;color:${PALETTE.ink};text-align:right;word-break:break-word;">` +
        `${escapeHtml(fact.value)}</td>` +
        `</tr>`,
    )
    .join('');

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="width:100%;background-color:${PALETTE.brandSubtle};border-radius:10px;` +
    `margin:0 0 20px 0;">${rows}</table>`
  );
}

function itemsHtml(items: NonNullable<EmailContent['items']>): string {
  const lines = items.lines
    .map(
      (line) =>
        `<tr>` +
        `<td style="padding:10px 0;border-top:1px solid ${PALETTE.border};` +
        `font-family:${FONT_STACK};font-size:14px;color:${PALETTE.ink};">` +
        `${escapeHtml(line.name)}` +
        (line.variant
          ? `<span style="display:block;font-size:13px;color:${PALETTE.faint};">` +
            `${escapeHtml(line.variant)}</span>`
          : '') +
        `</td>` +
        `<td style="padding:10px 0;border-top:1px solid ${PALETTE.border};` +
        `font-family:${FONT_STACK};font-size:14px;color:${PALETTE.muted};` +
        `text-align:right;white-space:nowrap;vertical-align:top;">` +
        `&times;${String(line.quantity)}</td>` +
        `</tr>`,
    )
    .join('');

  const more =
    items.hiddenCount > 0
      ? `<tr><td colspan="2" style="padding:10px 0;border-top:1px solid ${PALETTE.border};` +
        `font-family:${FONT_STACK};font-size:13px;color:${PALETTE.faint};">` +
        `${escapeHtml(plural(items.hiddenCount, 'more item', 'more items'))}</td></tr>`
      : '';

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="width:100%;margin:0 0 20px 0;">${lines}${more}</table>`
  );
}

/**
 * A button that survives Outlook.
 *
 * A table cell with a background colour and an anchor filling it, rather than a
 * styled `<a>`: Word's renderer ignores padding on inline elements, which would
 * collapse a CSS button into underlined text.
 */
function buttonHtml(action: EmailAction, variant: 'primary' | 'secondary'): string {
  const isPrimary = variant === 'primary';

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:0 0 10px 0;"><tr><td align="center" ` +
    `style="border-radius:8px;background-color:${isPrimary ? PALETTE.brand : PALETTE.card};` +
    `border:1px solid ${isPrimary ? PALETTE.brand : PALETTE.border};">` +
    `<a href="${escapeHtml(action.url)}" ` +
    `style="display:inline-block;padding:12px 22px;font-family:${FONT_STACK};font-size:15px;` +
    `font-weight:600;line-height:1;color:${isPrimary ? PALETTE.brandInk : PALETTE.ink};` +
    `text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a>` +
    `</td></tr></table>`
  );
}

function footerHtml(brand: EmailBrand, footer: EmailFooter): string {
  const link = (url: string, label: string): string =>
    `<a href="${escapeHtml(url)}" style="color:${PALETTE.muted};">${escapeHtml(label)}</a>`;

  // Joined with a middot, and only the links that apply — a footer that
  // printed "Your account ·" beside nothing would read as a rendering bug.
  const links = [
    footer.showAccountLink === false ? null : link(brand.accountUrl, 'Your account'),
    brand.supportEmail ? link(`mailto:${brand.supportEmail}`, brand.supportEmail) : null,
    footer.optOut ? link(footer.optOut.url, footer.optOut.label) : null,
  ].filter((entry): entry is string => entry !== null);

  return (
    `<tr><td style="padding:8px 24px 26px 24px;">` +
    `<div style="border-top:1px solid ${PALETTE.border};padding-top:16px;">` +
    `<p style="margin:0 0 8px 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;` +
    `color:${PALETTE.faint};">${escapeHtml(footer.reason)}</p>` +
    (links.length > 0
      ? `<p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;` +
        `color:${PALETTE.faint};">${links.join(' &middot; ')}</p>`
      : '') +
    `</div></td></tr>`
  );
}

/**
 * Renders one message, in both forms.
 *
 * The plain-text version is generated from the same `EmailContent` rather than
 * written separately, so the two cannot drift into saying different things —
 * which matters, because the text part is what a screen reader, a terminal mail
 * client and a spam filter's content check all read.
 */
export function renderEmail(content: EmailContent, brand: EmailBrand): RenderedEmail {
  const body =
    `<h1 style="margin:0 0 14px 0;font-family:${FONT_STACK};font-size:23px;line-height:1.3;` +
    `font-weight:700;letter-spacing:-0.01em;color:${PALETTE.ink};">` +
    `${escapeHtml(content.heading)}</h1>` +
    paragraphHtml(content.greeting, PALETTE.ink) +
    content.paragraphs.map((text) => paragraphHtml(text)).join('') +
    factsHtml(content.facts) +
    (content.items ? itemsHtml(content.items) : '') +
    (content.primary ? buttonHtml(content.primary, 'primary') : '') +
    (content.secondary ? buttonHtml(content.secondary, 'secondary') : '') +
    (content.notes ?? [])
      .map(
        (note) =>
          `<p style="margin:14px 0 0 0;font-family:${FONT_STACK};font-size:13px;` +
          `line-height:1.6;color:${PALETTE.faint};">${escapeHtml(note)}</p>`,
      )
      .join('');

  const html =
    `<!doctype html>` +
    `<html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    // Tells clients this design is light-only, so the ones that ask before
    // inverting do not repaint it into something it was never checked against.
    `<meta name="color-scheme" content="light">` +
    `<meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(content.heading)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${PALETTE.page};">` +
    preheader(content.preview) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="width:100%;background-color:${PALETTE.page};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    /**
     * The 600px cap, expressed so that Outlook and everything else both get it.
     *
     * The card is fluid — `width="100%"` with `max-width:600px` — and the fixed
     * width lives in a conditional comment only Word's rendering engine reads.
     * That split is the point: Word ignores `max-width` entirely and would
     * otherwise draw the card edge to edge on a wide monitor, while a literal
     * `width="600"` attribute would be a preferred width every other client
     * honoured, leaving the card unable to shrink below 600px on anything
     * narrower.
     *
     * Modern browsers reconcile `width="600"` against `width:100%` in the card's
     * favour, so this is robustness rather than a fix — but "the browser I
     * checked in resolves it sensibly" is a weak guarantee to hand to a dozen
     * mail clients, two of which parse HTML with a word processor.
     */
    `<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" ` +
    `border="0"><tr><td><![endif]-->` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="width:100%;max-width:600px;background-color:${PALETTE.card};` +
    `border:1px solid ${PALETTE.border};border-radius:14px;">` +
    masthead() +
    `<tr><td style="padding:12px 24px 4px 24px;">${body}</td></tr>` +
    footerHtml(brand, content.footer ?? ORDER_FOOTER) +
    `</table>` +
    `<!--[if mso]></td></tr></table><![endif]-->` +
    `</td></tr></table></body></html>`;

  return { html, text: renderText(content, brand) };
}

/** The same message, as text. */
function renderText(content: EmailContent, brand: EmailBrand): string {
  const blocks: string[] = ['ZyCart', '', content.heading, '', content.greeting, ''];

  for (const paragraph of content.paragraphs) blocks.push(paragraph, '');

  if (content.facts.length > 0) {
    for (const fact of content.facts) blocks.push(`${fact.label}: ${fact.value}`);
    blocks.push('');
  }

  if (content.items) {
    for (const line of content.items.lines) {
      blocks.push(
        `- ${line.name}${line.variant ? ` (${line.variant})` : ''} x${String(line.quantity)}`,
      );
    }
    if (content.items.hiddenCount > 0) {
      blocks.push(`- ${plural(content.items.hiddenCount, 'more item', 'more items')}`);
    }
    blocks.push('');
  }

  // The URL is printed in full: a text part has nowhere to hide a link, and a
  // bare label with no address would be a dead end.
  if (content.primary) blocks.push(`${content.primary.label}: ${content.primary.url}`);
  if (content.secondary) blocks.push(`${content.secondary.label}: ${content.secondary.url}`);
  if (content.primary ?? content.secondary) blocks.push('');

  for (const note of content.notes ?? []) blocks.push(note);
  if ((content.notes ?? []).length > 0) blocks.push('');

  const footer = content.footer ?? ORDER_FOOTER;

  // The order footer keeps its original, shorter text-part wording, so the
  // Phase 14 messages read exactly as they always did.
  blocks.push('--', content.footer ? footer.reason : 'This is a service message about your ZyCart order.');

  if (footer.showAccountLink !== false) blocks.push(`Your account: ${brand.accountUrl}`);
  if (brand.supportEmail) blocks.push(`Support: ${brand.supportEmail}`);
  if (footer.optOut) blocks.push(`${footer.optOut.label}: ${footer.optOut.url}`);

  return `${blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** `1 more item` / `3 more items`. Shared by both renderers so they agree. */
export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}
