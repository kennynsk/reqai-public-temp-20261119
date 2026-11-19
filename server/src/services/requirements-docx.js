import { Document, Packer, Paragraph, TextRun, Footer, Header, PageNumber, AlignmentType } from 'docx';

// compact_reference_guide + memo_masthead; no tables for long prose records.
const style = (id, name, size, before, after, color = '172033', bold = false) => ({ id, name, basedOn: id === 'Normal' ? undefined : 'Normal', next: 'Normal', run: { font: 'Calibri', size, color, bold }, paragraph: { spacing: { before, after, line: 300 }, widowControl: true, ...(id.startsWith('Heading') || id === 'Title' ? { keepNext: true, outlineLevel: id === 'Heading1' ? 0 : id === 'Heading2' ? 1 : undefined } : {}) } });
export async function documentDocx(model) {
  const document = new Document({ creator: 'ReqAI', title: model.title, description: model.versionLabel,
    styles: { paragraphStyles: [style('Normal', 'Normal', 22, 0, 120), style('Title', 'Title', 46, 0, 320, '172033', true), style('Heading1', 'Heading 1', 32, 360, 200, '2E74B5', true), style('Heading2', 'Heading 2', 26, 280, 140, '2E74B5', true), style('Heading3', 'Heading 3', 24, 200, 100, '1F4D78', true), style('Header', 'Header', 18, 0, 0, '64748B'), style('Footer', 'Footer', 18, 0, 0, '64748B')] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1800, left: 1440, right: 1440, header: 708, footer: 708 } } },
      headers: { default: new Header({ children: [new Paragraph({ text: 'ReqAI · Сохранённая версия требований', style: 'Header' })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ style: 'Footer', alignment: AlignmentType.RIGHT, children: [new TextRun('Страница '), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children: [new Paragraph({ text: model.title, style: 'Title' }), ...model.blocks.map((block) => new Paragraph({ style: block.kind === 'heading' ? `Heading${block.level}` : 'Normal', children: block.text.split('\n').flatMap((line, index) => [new TextRun({ text: line, ...(index ? { break: 1 } : {}) })]) }))],
    }],
  });
  return Packer.toBuffer(document);
}
