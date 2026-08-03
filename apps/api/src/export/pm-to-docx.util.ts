import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  UnderlineType,
  ThematicBreak,
} from 'docx';
interface PmNode {
  type: string;
  text?: string;
  content?: PmNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

type DocxBlock = Paragraph | Table;
type DocxImageType = 'jpg' | 'png' | 'gif' | 'bmp';
type ImageCache = Map<string, { data: Buffer; type: DocxImageType } | null>;

// ─── Images ───────────────────────────────────────────────────────────────────

function docxImageType(url: string): DocxImageType | null {
  const ext = url.split('.').pop()?.toLowerCase().split(/[?#]/)[0];
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'gif') return 'gif';
  if (ext === 'bmp') return 'bmp';
  return null; // e.g. webp/svg — not supported by docx's ImageRun
}

function collectImageUrls(node: PmNode, out: Set<string>): void {
  if (node.type === 'image' && typeof node.attrs?.src === 'string') out.add(node.attrs.src);
  for (const child of node.content ?? []) collectImageUrls(child, out);
}

async function fetchImages(doc: PmNode): Promise<ImageCache> {
  const urls = new Set<string>();
  collectImageUrls(doc, urls);
  const cache: ImageCache = new Map();

  await Promise.all(
    Array.from(urls).map(async (url) => {
      const type = docxImageType(url);
      if (!type) {
        cache.set(url, null);
        return;
      }
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = Buffer.from(await res.arrayBuffer());
        cache.set(url, { data, type });
      } catch {
        cache.set(url, null);
      }
    }),
  );

  return cache;
}

/** `date` variables are stored ISO but rendered DD.MM.YYYY (RU/KG convention). */
function formatVariableValue(value: string, varType: string): string {
  if (varType === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}.${m}.${y}`;
  }
  return value;
}

// ─── Text runs ────────────────────────────────────────────────────────────────

function buildTextRun(node: PmNode): TextRun {
  const marks = new Set((node.marks ?? []).map((m) => m.type));
  const textStyleMark = (node.marks ?? []).find((m) => m.type === 'textStyle');
  const fontSizePt = textStyleMark?.attrs?.fontSize
    ? parseFloat(String(textStyleMark.attrs.fontSize))
    : undefined;

  return new TextRun({
    text: node.text ?? '',
    bold: marks.has('bold'),
    italics: marks.has('italic'),
    ...(marks.has('underline') ? { underline: { type: UnderlineType.SINGLE } } : {}),
    strike: marks.has('strike'),
    ...(fontSizePt ? { size: Math.round(fontSizePt * 2) } : {}),
  });
}

// ─── Inline content of a block → TextRun[] ───────────────────────────────────

function inlineChildren(node: PmNode): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of node.content ?? []) {
    if (child.type === 'text') {
      runs.push(buildTextRun(child));
    } else if (child.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }));
    } else if (child.type === 'variableToken') {
      const value = (child.attrs?.value as string | undefined)?.trim();
      const label = (child.attrs?.label as string | undefined) ?? '';
      const varType = (child.attrs?.varType as string | undefined) ?? 'text';
      runs.push(new TextRun({ text: value ? formatVariableValue(value, varType) : `[${label}]` }));
    }
  }
  return runs;
}

// ─── Alignment ────────────────────────────────────────────────────────────────

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function alignAttr(node: PmNode): (typeof AlignmentType)[keyof typeof AlignmentType] {
  return ALIGN_MAP[(node.attrs?.textAlign as string) ?? 'left'] ?? AlignmentType.LEFT;
}

// ─── Block conversion ─────────────────────────────────────────────────────────

function nodeToBlocks(node: PmNode, images: ImageCache): DocxBlock[] {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).flatMap((n) => nodeToBlocks(n, images));

    case 'paragraph':
      return [new Paragraph({ children: inlineChildren(node), alignment: alignAttr(node) })];

    case 'image': {
      const src = node.attrs?.src as string | undefined;
      const cached = src ? images.get(src) : null;
      if (!cached) return [];
      const width = (node.attrs?.width as number | undefined) ?? 120;
      const height = (node.attrs?.height as number | undefined) ?? 120;
      return [
        new Paragraph({
          alignment: alignAttr(node),
          children: [new ImageRun({ type: cached.type, data: cached.data, transformation: { width, height } })],
        }),
      ];
    }

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      };
      return [
        new Paragraph({
          children: inlineChildren(node),
          heading: headingMap[level] ?? HeadingLevel.HEADING_1,
          alignment: alignAttr(node),
        }),
      ];
    }

    case 'bulletList':
    case 'orderedList': {
      const numbered = node.type === 'orderedList';
      const items: DocxBlock[] = [];
      for (const item of node.content ?? []) {
        const runs = (item.content ?? []).flatMap(inlineChildren);
        items.push(
          new Paragraph({
            children: runs,
            ...(numbered ? {} : { bullet: { level: 0 } }),
            ...(numbered ? { numbering: { reference: 'default-numbering', level: 0 } } : {}),
          }),
        );
      }
      return items;
    }

    case 'table': {
      const borderDef = { style: BorderStyle.SINGLE, size: 1, color: '333333' };
      const rows = (node.content ?? []).map(
        (row) =>
          new TableRow({
            children: (row.content ?? []).map(
              (cell) =>
                new TableCell({
                  children: (cell.content ?? []).flatMap((n) => nodeToBlocks(n, images)) as Paragraph[],
                  borders: {
                    top: borderDef, bottom: borderDef, left: borderDef, right: borderDef,
                  },
                  ...(cell.type === 'tableHeader'
                    ? { shading: { fill: 'F5F5F5', color: 'F5F5F5', type: 'solid' as const } }
                    : {}),
                }),
            ),
          }),
      );
      return [
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      ];
    }

    case 'horizontalRule':
      return [new Paragraph({ children: [new ThematicBreak()] })];

    case 'codeBlock':
      return [new Paragraph({ children: inlineChildren(node) })];

    default:
      return (node.content ?? []).flatMap((n) => nodeToBlocks(n, images));
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function pmToDocx(doc: unknown, title?: string): Promise<Buffer> {
  const pmDoc = doc as PmNode;
  const images = await fetchImages(pmDoc);
  const blocks = nodeToBlocks(pmDoc, images);

  const document = new Document({
    creator: 'Vault',
    title: title ?? 'Документ',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch each
          },
        },
        children: blocks,
      },
    ],
  });

  return Packer.toBuffer(document);
}
