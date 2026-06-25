import {
  Document,
  Packer,
  Paragraph,
  TextRun,
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

// ─── Text runs ────────────────────────────────────────────────────────────────

function buildTextRun(node: PmNode): TextRun {
  const marks = new Set((node.marks ?? []).map((m) => m.type));
  return new TextRun({
    text: node.text ?? '',
    bold: marks.has('bold'),
    italics: marks.has('italic'),
    ...(marks.has('underline') ? { underline: { type: UnderlineType.SINGLE } } : {}),
    strike: marks.has('strike'),
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

function nodeToBlocks(node: PmNode): DocxBlock[] {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).flatMap(nodeToBlocks);

    case 'paragraph':
      return [new Paragraph({ children: inlineChildren(node), alignment: alignAttr(node) })];

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
                  children: (cell.content ?? []).flatMap(nodeToBlocks) as Paragraph[],
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
      return (node.content ?? []).flatMap(nodeToBlocks);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function pmToDocx(doc: unknown, title?: string): Promise<Buffer> {
  const blocks = nodeToBlocks(doc as PmNode);

  const document = new Document({
    creator: 'AI Vault',
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
