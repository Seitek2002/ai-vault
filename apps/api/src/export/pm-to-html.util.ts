interface PmNode {
  type: string;
  text?: string;
  content?: PmNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textNodeToHtml(node: PmNode): string {
  let html = esc(node.text ?? '');
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':      html = `<strong>${html}</strong>`; break;
      case 'italic':    html = `<em>${html}</em>`; break;
      case 'underline': html = `<u>${html}</u>`; break;
      case 'strike':    html = `<s>${html}</s>`; break;
      case 'code':      html = `<code>${html}</code>`; break;
    }
  }
  return html;
}

function nodeToHtml(node: PmNode): string {
  const children = () => (node.content ?? []).map(nodeToHtml).join('');
  const alignStyle = (node.attrs?.textAlign as string | undefined);
  const style = alignStyle && alignStyle !== 'left' ? ` style="text-align:${alignStyle}"` : '';

  switch (node.type) {
    case 'doc':
      return children();

    case 'paragraph':
      return `<p${style}>${children() || '&nbsp;'}</p>`;

    case 'heading': {
      const lvl = (node.attrs?.level as number) ?? 1;
      return `<h${lvl}${style}>${children()}</h${lvl}>`;
    }

    case 'text':
      return textNodeToHtml(node);

    case 'hardBreak':
      return '<br>';

    case 'bulletList':
      return `<ul>${children()}</ul>`;

    case 'orderedList':
      return `<ol>${children()}</ol>`;

    case 'listItem':
      return `<li>${children()}</li>`;

    case 'table':
      return `<table>${children()}</table>`;

    case 'tableRow':
      return `<tr>${children()}</tr>`;

    case 'tableHeader':
      return `<th>${children()}</th>`;

    case 'tableCell':
      return `<td>${children()}</td>`;

    case 'blockquote':
      return `<blockquote>${children()}</blockquote>`;

    case 'horizontalRule':
      return '<hr>';

    case 'codeBlock':
      return `<pre><code>${children()}</code></pre>`;

    default:
      return children();
  }
}

const PAGE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #000;
    padding: 0;
  }
  h1 { font-size: 16pt; font-weight: bold; text-align: center; margin: 1em 0 0.5em; }
  h2 { font-size: 14pt; font-weight: bold; margin: 0.9em 0 0.4em; }
  h3 { font-size: 12pt; font-weight: bold; margin: 0.8em 0 0.3em; }
  p  { margin: 0.4em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.4em 0; }
  li { margin: 0.2em 0; }
  table { width: 100%; border-collapse: collapse; margin: 0.8em 0; font-size: 11pt; }
  th, td { border: 1px solid #333; padding: 4pt 8pt; vertical-align: top; }
  th { font-weight: bold; background: #f5f5f5; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  u  { text-decoration: underline; }
  s  { text-decoration: line-through; }
  code { font-family: monospace; background: #f4f4f4; padding: 0 3pt; }
  pre  { background: #f4f4f4; padding: 8pt; margin: 0.5em 0; }
  hr   { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #555; }
`;

export function pmToHtml(doc: unknown, title?: string): string {
  const body = nodeToHtml(doc as PmNode);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${esc(title ?? 'Документ')}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}
