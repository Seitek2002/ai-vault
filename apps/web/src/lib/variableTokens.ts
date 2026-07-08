import type { TemplateVariable, TemplateVariableType } from "@ai-vault/types";

interface PmNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  [key: string]: unknown;
}

/**
 * Walks a ProseMirror doc (bodyJson) and returns the distinct set of
 * `variableToken` nodes it contains, keyed by `key` (first occurrence wins
 * for label/type/value — later duplicate insertions of the same variable
 * are treated as the same binding).
 */
export function extractVariables(bodyJson: unknown): TemplateVariable[] {
  const seen = new Map<string, TemplateVariable>();

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as PmNode;
    if (n.type === "variableToken" && n.attrs) {
      const key = String(n.attrs.key ?? "");
      if (key && !seen.has(key)) {
        seen.set(key, {
          key,
          label: String(n.attrs.label ?? key),
          varType: (n.attrs.varType as TemplateVariableType) ?? "text",
          value: String(n.attrs.value ?? ""),
        });
      }
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
    }
  }

  walk(bodyJson);
  return [...seen.values()];
}

/** Deep-clones `bodyJson`, applying `fn` to every plain-object node along the way. */
function cloneWalk(node: unknown, fn: (n: PmNode) => void): unknown {
  if (Array.isArray(node)) return node.map((item) => cloneWalk(item, fn));
  if (node && typeof node === "object") {
    const n: PmNode = { ...(node as PmNode) };
    fn(n);
    if (Array.isArray(n.content)) {
      n.content = n.content.map((c) => cloneWalk(c, fn)) as PmNode[];
    }
    return n;
  }
  return node;
}

/** Updates the current value of every `variableToken` node sharing `key`. */
export function setVariableInBody(bodyJson: unknown, key: string, value: string): unknown {
  return cloneWalk(bodyJson, (n) => {
    if (n.type === "variableToken" && n.attrs?.key === key) {
      n.attrs = { ...n.attrs, value };
    }
  });
}

/**
 * Renames the sidebar-facing label of every `variableToken` node sharing `key`.
 * Never touches `key`, so existing value bindings survive the rename untouched.
 */
export function setVariableLabelInBody(bodyJson: unknown, key: string, label: string): unknown {
  return cloneWalk(bodyJson, (n) => {
    if (n.type === "variableToken" && n.attrs?.key === key) {
      n.attrs = { ...n.attrs, label };
    }
  });
}

/** Slugifies a human label into a stable variable key, de-duped against existing keys. */
export function slugifyVariableKey(label: string, existingKeys: string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "var";
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}-${i}`;
    i += 1;
  }
  return key;
}
