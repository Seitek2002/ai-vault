import TiptapTable from "@tiptap/extension-table";

/**
 * Base Table extension plus an explicit `borderless` attribute — a table is
 * normally treated as borderless implicitly (no `tableHeader` cell among its
 * children, see editor.css's `table:not(:has(th))` rule and the backend's
 * isBorderlessTable helper), but this lets that be overridden explicitly and
 * gives future table-building code (letterheads, layout tables) a real flag
 * to set instead of relying on "does it happen to have a th cell".
 */
export const Table = TiptapTable.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderless: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-borderless");
          if (v === "true") return true;
          if (v === "false") return false;
          return null;
        },
        renderHTML: (attributes) => {
          if (attributes.borderless === true) return { "data-borderless": "true" };
          if (attributes.borderless === false) return { "data-borderless": "false" };
          return {};
        },
      },
    };
  },
});
