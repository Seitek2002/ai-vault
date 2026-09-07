interface PmNodeLike {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNodeLike[];
}

/**
 * A table is "borderless" (pure layout — dates/places, реквизиты blocks,
 * signature rows — no visible grid) when:
 *  - explicitly flagged via `attrs.borderless` on the table node, or
 *  - for tables predating that attribute: none of its cells is a
 *    `tableHeader` (mirrors the editor's `table:not(:has(th))` CSS rule).
 *
 * Shared by both the PDF (pm-to-html) and DOCX (pm-to-docx) exporters so
 * a table renders identically — bordered or not — regardless of which
 * export format is used.
 */
export function isBorderlessTable(table: PmNodeLike): boolean {
  if (table.attrs?.borderless === true) return true;
  if (table.attrs?.borderless === false) return false;

  for (const row of table.content ?? []) {
    for (const cell of row.content ?? []) {
      if (cell.type === 'tableHeader') return false;
    }
  }
  return true;
}
