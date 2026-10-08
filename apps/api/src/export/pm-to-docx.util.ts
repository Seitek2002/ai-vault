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
  Header,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
} from 'docx';
import { isBorderlessTable } from './table-borders.util';
import { readPageLayout, pageDimensions, type PageLayout } from '@ai-vault/doc-placeholders';

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

function cellWidth(node: PmNode): number {
  const widths = node.attrs?.colwidth;
  return Array.isArray(widths) && widths.length && widths.every(w => typeof w === 'number' && Number.isFinite(w) && w > 0)
    ? widths.reduce((sum, w) => sum + w, 0) : 0;
}

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
      // Layout-only tables (dates/places, реквизиты blocks, signature rows —
      // see isBorderlessTable) must render with no grid at all, matching the
      // editor and the PDF export — otherwise Word's default table style
      // draws a visible border even when none is set explicitly here.
      const borderless = isBorderlessTable(node);
      const borderDef = borderless
        ? { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
        : { style: BorderStyle.SINGLE, size: 1, color: '333333' };
      const rows = (node.content ?? []).map(
        (row) => {
          const widths = (row.content ?? []).map(cellWidth);
          const totalWidth = widths.every(w => w > 0) ? widths.reduce((sum, w) => sum + w, 0) : 0;
          return new TableRow({
            children: (row.content ?? []).map(
              (cell, index) =>
                new TableCell({
                  children: (cell.content ?? []).flatMap((n) => nodeToBlocks(n, images)) as Paragraph[],
                  ...(totalWidth ? { width: { size: widths[index]! / totalWidth * 100, type: WidthType.PERCENTAGE } } : {}),
                  borders: {
                    top: borderDef, bottom: borderDef, left: borderDef, right: borderDef,
                  },
                  ...(!borderless && cell.type === 'tableHeader'
                    ? { shading: { fill: 'F5F5F5', color: 'F5F5F5', type: 'solid' as const } }
                    : {}),
                }),
            ),
          });
        },
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

export async function pmToDocx(doc: unknown, title?: string, layout: PageLayout = readPageLayout({}), background?: { data: Buffer; width: number; height: number }): Promise<Buffer> {
  const pmDoc = doc as PmNode;
  const images = await fetchImages(pmDoc);
  const blocks = nodeToBlocks(pmDoc, images);
  const size = pageDimensions(layout), twips = (mm: number) => Math.round(mm * 1440 / 25.4);

  const document = new Document({
    creator: 'Vault',
    title: title ?? 'Документ',
    sections: [
      {
        ...(background ? { headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({
          type: 'png', data: background.data,
          transformation: { width: background.width * 96 / 25.4, height: background.height * 96 / 25.4 },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round((size.width - background.width) / 2 * 36000) },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round((size.height - background.height) / 2 * 36000) },
            behindDocument: true, allowOverlap: true,
          },
        })] })] }) } } : {}),
        properties: {
          page: {
            size: { width: twips(size.width), height: twips(size.height) },
            margin: Object.fromEntries(Object.entries(layout.margins).map(([key, value]) => [key, twips(value)])),
          },
        },
        children: blocks,
      },
    ],
  });

  return Packer.toBuffer(document);
}
