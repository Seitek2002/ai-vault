import TiptapImage from "@tiptap/extension-image";

/**
 * Base Image extension plus width/height (px) attrs, rendered as inline
 * style so the size set at insertion time (e.g. a letterhead logo) is
 * preserved through save/load and matches what the HTML/DOCX exporters read
 * off the same node attrs.
 */
export const Image = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const v = element.style.width || element.getAttribute("width");
          return v ? parseInt(v, 10) : null;
        },
        renderHTML: (attributes) => (attributes.width ? { style: `width: ${attributes.width}px` } : {}),
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const v = element.style.height || element.getAttribute("height");
          return v ? parseInt(v, 10) : null;
        },
        renderHTML: (attributes) => (attributes.height ? { style: `height: ${attributes.height}px` } : {}),
      },
    };
  },
});
