import { Node, mergeAttributes } from "@tiptap/core";

export type TemplateVariableType = "text" | "date";

export interface VariableTokenAttrs {
  key: string;
  label: string;
  varType: TemplateVariableType;
  value: string;
}

/**
 * Renders a variable's stored value for display. `date` variables are stored as
 * ISO (YYYY-MM-DD, straight from the <input type="date">) but shown in the RU/KG
 * DD.MM.YYYY convention. Other types render their value verbatim.
 */
export function formatVariableValue(value: string, varType: TemplateVariableType): string {
  if (varType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  return value;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variableToken: {
      insertVariable: (attrs: VariableTokenAttrs) => ReturnType;
    };
  }
}

/**
 * Inline atom node representing a named template variable (constructor feature).
 * The label is stored on the node itself but renamed via setVariableLabelInBody
 * (lib/variableTokens.ts), which rewrites every node sharing the same key —
 * so renaming never requires touching the variable's key/binding.
 */
export const VariableToken = Node.create({
  name: "variableToken",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      key: { default: "" },
      label: { default: "" },
      varType: { default: "text" },
      value: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable-token]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { key, label, varType, value } = node.attrs as VariableTokenAttrs;
    const display = value?.trim() ? formatVariableValue(value, varType) : `[${label || key}]`;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-variable-token": "",
        "data-key": key,
        "data-label": label,
        "data-var-type": varType,
        "data-value": value ?? "",
        class: "variable-token",
      }),
      display,
    ];
  },

  addCommands() {
    return {
      insertVariable:
        (attrs: VariableTokenAttrs) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs }).run(),
    };
  },
});
