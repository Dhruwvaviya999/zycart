/**
 * Turns an assistant reply into a small tree the UI can render as React.
 *
 * The important property is what it does *not* produce: a string of HTML.
 * Nothing here is ever passed to `dangerouslySetInnerHTML`, because model
 * output is untrusted text — a reply could contain a `<script>`, an `<iframe>`,
 * a `javascript:` URL or an `onerror` attribute, whether because a merchant put
 * it in a product description or because a customer talked the assistant into
 * repeating it. Parsing to data and letting React create the elements means
 * every one of those renders as the characters it is. There is no sanitiser to
 * get wrong, because there is no HTML.
 *
 * The supported subset is what a shopping answer actually uses: paragraphs,
 * bullet lists, **bold**, *italic* and `code`. Anything else is literal text.
 */

export type AiInline =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string };

export type AiBlock =
  { type: 'paragraph'; content: AiInline[] } | { type: 'list'; items: AiInline[][] };

/** `**bold**`, `*italic*` and `` `code` ``, in that precedence. */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

function parseInline(text: string): AiInline[] {
  const tokens: AiInline[] = [];

  for (const part of text.split(INLINE)) {
    if (!part) continue;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      tokens.push({ type: 'bold', value: part.slice(2, -2) });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      tokens.push({ type: 'code', value: part.slice(1, -1) });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      tokens.push({ type: 'italic', value: part.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', value: part });
    }
  }

  return tokens;
}

/** `- item`, `* item` or `1. item` — the three ways a model writes a list. */
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;

export function parseAiText(text: string): AiBlock[] {
  const blocks: AiBlock[] = [];

  let paragraph: string[] = [];
  let list: AiInline[][] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const bullet = BULLET.exec(line);

    if (bullet?.[1]) {
      flushParagraph();
      list.push(parseInline(bullet[1]));
      continue;
    }

    flushList();
    // A leading `#` is stripped rather than promoted: an assistant reply sits
    // inside a chat panel's heading outline, not above it.
    paragraph.push(line.replace(/^#{1,6}\s+/, '').trim());
  }

  flushParagraph();
  flushList();

  return blocks;
}
