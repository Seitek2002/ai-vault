import mammoth from 'mammoth';

export interface PmNode {
  type: string;
  text?: string;
  content?: PmNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

interface TagToken { kind: 'open' | 'close' | 'self'; tag: string; attrs: Record<string, string> }
interface TextToken { kind: 'text'; value: string }
type Token = TagToken | TextToken;

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']);

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] !== '<') {
      let j = i;
      while (j < html.length && html[j] !== '<') j++;
      const decoded = html.slice(i, j)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
      if (decoded.trim() || decoded.includes(' ')) {
        tokens.push({ kind: 'text', value: decoded });
      }
      i = j;
      continue;
    }

    // Find end of tag, respecting quoted attributes
    let j = i + 1;
    let inStr = false;
    let qChar = '';
    while (j < html.length && (inStr || html[j] !== '>')) {
      if (inStr) { if (html[j] === qChar) inStr = false; }
      else if (html[j] === '"' || html[j] === "'") { inStr = true; qChar = html[j]!; }
      j++;
    }
    j++;

    const raw = html.slice(i, j);
    if (raw.startsWith('</')) {
      const tag = /^<\/(\w+)/.exec(raw)?.[1]?.toLowerCase() ?? '';
      if (tag) tokens.push({ kind: 'close', tag, attrs: {} });
    } else if (!raw.startsWith('<!') && !raw.startsWith('<?')) {
      const tag = /^<(\w+)/.exec(raw)?.[1]?.toLowerCase() ?? '';
      if (tag) {
        const attrs: Record<string, string> = {};
        const attrRe = /(\w[\w-]*)=["']([^"']*)["']/g;
        let m: RegExpExecArray | null;
        while ((m = attrRe.exec(raw)) !== null) attrs[m[1]!.toLowerCase()] = m[2]!;
        const isSelf = raw.endsWith('/>') || VOID_TAGS.has(tag);
        tokens.push({ kind: isSelf ? 'self' : 'open', tag, attrs });
      }
    }
    i = j;
  }

  return tokens;
}

// ── Context helpers ───────────────────────────────────────────────────────────

interface Ctx { tokens: Token[]; i: number }

function peek(c: Ctx): Token | undefined { return c.tokens[c.i]; }
function advance(c: Ctx): Token | undefined { return c.tokens[c.i++]; }

/** Consume tokens until the matching close tag (consumes close tag too). */
function consumeUntil(ctx: Ctx, closeTag: string): Token[] {
  const out: Token[] = [];
  while (ctx.i < ctx.tokens.length) {
    const t = ctx.tokens[ctx.i]!;
    if (t.kind === 'close' && t.tag === closeTag) { ctx.i++; break; }
    out.push(ctx.tokens[ctx.i++]!);
  }
  return out;
}

// ── Inline parser ─────────────────────────────────────────────────────────────

function parseInline(tokens: Token[], marks: Array<{ type: string }> = []): PmNode[] {
  const ctx: Ctx = { tokens, i: 0 };
  const nodes: PmNode[] = [];

  while (ctx.i < tokens.length) {
    const t = advance(ctx)!;
    if (t.kind === 'text') {
      const text = t.value.replace(/[ \t\r\n]+/g, ' ');
      if (text) {
        nodes.push({ type: 'text', text, ...(marks.length ? { marks: [...marks] } : {}) });
      }
    } else if (t.kind === 'self' && (t as TagToken).tag === 'br') {
      nodes.push({ type: 'hardBreak' });
    } else if (t.kind === 'open') {
      const tag = (t as TagToken).tag;
      const newMarks = [...marks];
      if (tag === 'strong' || tag === 'b') newMarks.push({ type: 'bold' });
      else if (tag === 'em' || tag === 'i') newMarks.push({ type: 'italic' });
      else if (tag === 'u') newMarks.push({ type: 'underline' });
      else if (tag === 's' || tag === 'del' || tag === 'strike') newMarks.push({ type: 'strike' });
      const inner = consumeUntil(ctx, tag);
      nodes.push(...parseInline(inner, newMarks));
    }
  }

  return nodes.filter((n) => (n.type === 'text' && n.text !== '') || n.type === 'hardBreak');
}

// ── Block parser ──────────────────────────────────────────────────────────────

function parseBlockTokens(tokens: Token[]): PmNode[] {
  const ctx: Ctx = { tokens, i: 0 };
  const blocks: PmNode[] = [];

  while (ctx.i < tokens.length) {
    const t = peek(ctx);
    if (!t) break;

    if (t.kind === 'text') {
      advance(ctx);
      const text = t.value.trim();
      if (text) blocks.push({ type: 'paragraph', content: [{ type: 'text', text }] });
      continue;
    }

    if (t.kind === 'close' || t.kind === 'self') { advance(ctx); continue; }

    // Open tag
    advance(ctx);
    const tag = (t as TagToken).tag;

    if (tag === 'p') {
      const inner = consumeUntil(ctx, 'p');
      const content = parseInline(inner);
      if (content.length) blocks.push({ type: 'paragraph', content });
    } else if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]!);
      const inner = consumeUntil(ctx, tag);
      const content = parseInline(inner);
      if (content.length) blocks.push({ type: 'heading', attrs: { level }, content });
    } else if (tag === 'ul' || tag === 'ol') {
      const listType = tag === 'ul' ? 'bulletList' : 'orderedList';
      const listTokens = consumeUntil(ctx, tag);
      const listCtx: Ctx = { tokens: listTokens, i: 0 };
      const items: PmNode[] = [];
      while (listCtx.i < listTokens.length) {
        const lt = peek(listCtx);
        if (!lt) break;
        if (lt.kind === 'open' && (lt as TagToken).tag === 'li') {
          advance(listCtx);
          const liInner = consumeUntil(listCtx, 'li');
          const content = parseInline(liInner);
          if (content.length) items.push({ type: 'listItem', content: [{ type: 'paragraph', content }] });
        } else { advance(listCtx); }
      }
      if (items.length) blocks.push({ type: listType, content: items });
    } else if (tag === 'table') {
      blocks.push(buildTable(consumeUntil(ctx, 'table')));
    } else {
      // Container or unknown — recurse into children
      const inner = consumeUntil(ctx, tag);
      blocks.push(...parseBlockTokens(inner));
    }
  }

  return blocks;
}

// ── Table builder ─────────────────────────────────────────────────────────────

const TABLE_SECTION_TAGS = new Set(['thead', 'tbody', 'tfoot', 'colgroup', 'caption', 'col']);

function buildTable(tableTokens: Token[]): PmNode {
  // Strip thead/tbody/tfoot wrappers (keep their row content)
  const flat = tableTokens.filter((t) => {
    if (t.kind === 'open' || t.kind === 'close') return !TABLE_SECTION_TAGS.has((t as TagToken).tag);
    return true;
  });

  const tCtx: Ctx = { tokens: flat, i: 0 };
  const rows: PmNode[] = [];

  while (tCtx.i < flat.length) {
    const t = peek(tCtx);
    if (!t) break;
    if (t.kind !== 'open' || (t as TagToken).tag !== 'tr') { advance(tCtx); continue; }
    advance(tCtx);
    const cells = parseCells(consumeUntil(tCtx, 'tr'));
    if (cells.length) rows.push({ type: 'tableRow', content: cells });
  }

  return { type: 'table', content: rows };
}

function parseCells(tokens: Token[]): PmNode[] {
  const cells: PmNode[] = [];
  const ctx: Ctx = { tokens, i: 0 };

  while (ctx.i < tokens.length) {
    const t = peek(ctx);
    if (!t) break;
    if (t.kind !== 'open' || !['td', 'th'].includes((t as TagToken).tag)) { advance(ctx); continue; }

    const cellTag = (t as TagToken).tag;
    const attrs = (t as TagToken).attrs;
    advance(ctx);
    const cellTokens = consumeUntil(ctx, cellTag);

    const hasBlockTags = cellTokens.some(
      (tok) =>
        tok.kind === 'open' &&
        ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table'].includes((tok as TagToken).tag),
    );

    let content: PmNode[];
    if (hasBlockTags) {
      content = parseBlockTokens(cellTokens);
    } else {
      const inline = parseInline(cellTokens);
      content = inline.length ? [{ type: 'paragraph', content: inline }] : [];
    }

    cells.push({
      type: cellTag === 'th' ? 'tableHeader' : 'tableCell',
      attrs: {
        colspan: parseInt(attrs.colspan ?? '1') || 1,
        rowspan: parseInt(attrs.rowspan ?? '1') || 1,
        colwidth: null,
      },
      content: content.length ? content : [{ type: 'paragraph', content: [] }],
    });
  }

  return cells;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a .docx buffer to ProseMirror JSON, preserving tables, headings, and inline formatting.
 */
export async function parseDocxToPm(buffer: Buffer): Promise<{ type: 'doc'; content: PmNode[] }> {
  const result = await mammoth.convertToHtml({ buffer }, {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Title'] => h1:fresh",
    ],
  });

  const tokens = tokenize(result.value);
  const blocks = parseBlockTokens(tokens).filter((b) => b.content && b.content.length > 0);
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph', content: [] }] };
}

/** Legacy plain-text extraction used by PDF/TXT fallback. */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}
