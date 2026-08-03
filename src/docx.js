import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { OUTLINE_FIELDS } from './schema.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DOCUMENT_PATH = 'word/document.xml';

let templatePromise;

function elementChildren(node, localName) {
  return Array.from(node.childNodes).filter(
    (child) => child.nodeType === 1 && child.namespaceURI === W_NS && child.localName === localName,
  );
}

function createW(doc, localName) {
  return doc.createElementNS(W_NS, `w:${localName}`);
}

function setWAttribute(element, localName, value) {
  element.setAttributeNS(W_NS, `w:${localName}`, String(value));
}

function createRun(doc, value, { bold = false, size = 20 } = {}) {
  const run = createW(doc, 'r');
  const runProperties = createW(doc, 'rPr');
  const fonts = createW(doc, 'rFonts');
  setWAttribute(fonts, 'hint', 'eastAsia');
  runProperties.appendChild(fonts);

  if (bold) runProperties.appendChild(createW(doc, 'b'));

  const fontSize = createW(doc, 'sz');
  const complexFontSize = createW(doc, 'szCs');
  setWAttribute(fontSize, 'val', size);
  setWAttribute(complexFontSize, 'val', size);
  runProperties.appendChild(fontSize);
  runProperties.appendChild(complexFontSize);
  run.appendChild(runProperties);

  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) run.appendChild(createW(doc, 'br'));
    const text = createW(doc, 't');
    text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    text.appendChild(doc.createTextNode(line));
    run.appendChild(text);
  });
  return run;
}

function setCellText(doc, cell, prefix, value) {
  let paragraph = elementChildren(cell, 'p')[0];
  if (!paragraph) {
    paragraph = createW(doc, 'p');
    cell.appendChild(paragraph);
  }

  Array.from(paragraph.childNodes).forEach((child) => {
    if (!(child.nodeType === 1 && child.namespaceURI === W_NS && child.localName === 'pPr')) {
      paragraph.removeChild(child);
    }
  });
  paragraph.appendChild(createRun(doc, `${prefix ?? ''}${value ?? ''}`));
}

function createParagraph(doc, value, options = {}) {
  const paragraph = createW(doc, 'p');
  const properties = createW(doc, 'pPr');
  const spacing = createW(doc, 'spacing');
  setWAttribute(spacing, 'before', options.before ?? 0);
  setWAttribute(spacing, 'after', options.after ?? 120);
  setWAttribute(spacing, 'line', options.line ?? 300);
  setWAttribute(spacing, 'lineRule', 'auto');
  properties.appendChild(spacing);
  if (options.keepNext) properties.appendChild(createW(doc, 'keepNext'));
  paragraph.appendChild(properties);
  paragraph.appendChild(createRun(doc, value, { bold: options.bold, size: options.size ?? 20 }));
  return paragraph;
}

function appendEssay(doc, table, essay) {
  const body = table.parentNode;
  const reference = table.nextSibling;
  const heading = createParagraph(doc, 'ESSAY', {
    bold: true,
    size: 24,
    before: 240,
    after: 100,
    keepNext: true,
  });
  body.insertBefore(heading, reference);

  const paragraphs = String(essay ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  (paragraphs.length ? paragraphs : ['']).forEach((text) => {
    body.insertBefore(createParagraph(doc, text, { after: 120, line: 360 }), reference);
  });
}

function makeTableFlowWithEssay(table) {
  const tableProperties = elementChildren(table, 'tblPr')[0];
  if (!tableProperties) return;
  elementChildren(tableProperties, 'tblpPr').forEach((node) => tableProperties.removeChild(node));
}

async function getTemplateBytes() {
  if (!templatePromise) {
    templatePromise = fetch('/writing-template.docx').then(async (response) => {
      if (!response.ok) throw new Error('원본 DOCX를 불러오지 못했습니다.');
      return response.arrayBuffer();
    });
  }
  return (await templatePromise).slice(0);
}

export async function buildDocxBlobFromBytes(templateBytes, draft) {
  const zip = await JSZip.loadAsync(templateBytes);
  const documentXml = await zip.file(DOCUMENT_PATH)?.async('string');
  if (!documentXml) throw new Error('DOCX 문서 구조를 찾지 못했습니다.');

  const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error('DOCX 문서 구조를 읽지 못했습니다.');

  const table = doc.getElementsByTagNameNS(W_NS, 'tbl')[0];
  if (!table) throw new Error('원본 아웃라인 표를 찾지 못했습니다.');
  const rows = elementChildren(table, 'tr');
  if (rows.length < 20) throw new Error('원본 아웃라인 표 형식이 예상과 다릅니다.');

  const titleCell = elementChildren(rows[0], 'tc')[0];
  setCellText(doc, titleCell, 'Title of your essay : ', draft.title);

  OUTLINE_FIELDS.forEach(({ key, row, prefix = '' }) => {
    const cells = elementChildren(rows[row], 'tc');
    setCellText(doc, cells[cells.length - 1], prefix, draft[key]);
  });

  makeTableFlowWithEssay(table);
  appendEssay(doc, table, draft.essay);

  zip.file(DOCUMENT_PATH, new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function buildDocxBlob(draft) {
  return buildDocxBlobFromBytes(await getTemplateBytes(), draft);
}
