import type { CompanySettings } from "./api/settings";

/**
 * Letterhead table node: company logo (if uploaded) + name/address, centered.
 * Reused both as the default header prefilled into brand-new constructor
 * templates and as the on-demand "Добавить колонтитул" editor toolbar action.
 * Returns null when there's nothing to show (no logo, no name, no address).
 */
export function buildLetterheadNode(settings: CompanySettings | null | undefined): object | null {
  if (!settings) return null;

  const headerCells: Array<Record<string, unknown>> = [];
  if (settings.logoUrl) {
    headerCells.push({ type: "image", attrs: { src: settings.logoUrl, width: 90, height: 90 } });
  }

  const infoParagraphs: Array<Record<string, unknown>> = [];
  if (settings.name) {
    infoParagraphs.push({
      type: "paragraph",
      attrs: { textAlign: "center" },
      content: [{ type: "text", text: settings.name, marks: [{ type: "bold" }] }],
    });
  }
  if (settings.address) {
    infoParagraphs.push({
      type: "paragraph",
      attrs: { textAlign: "center" },
      content: [{ type: "text", text: settings.address }],
    });
  }

  if (headerCells.length === 0 && infoParagraphs.length === 0) return null;

  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableHeader",
            content: [...headerCells, ...infoParagraphs],
          },
        ],
      },
    ],
  };
}
