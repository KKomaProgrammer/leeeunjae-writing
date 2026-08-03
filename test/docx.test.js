import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocxBlobFromBytes } from '../src/docx.js';
import { EMPTY_DRAFT } from '../src/schema.js';

describe('DOCX generation', () => {
  it('preserves the template package and fills outline plus essay content', async () => {
    const template = await readFile(new URL('../public/writing-template.docx', import.meta.url));
    const blob = await buildDocxBlobFromBytes(template, {
      ...EMPTY_DRAFT,
      title: 'A Better School Day',
      attentionGrabber: 'What if school began one hour later?',
      introMain1: 'Students need more sleep.',
      thesisStatement: 'School should start later for healthier learning.',
      essay: 'A later school day can help students focus.\nIt can also improve health.\n\nSchools should consider this change.',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file('word/document.xml').async('string');

    expect(zip.file('word/styles.xml')).toBeTruthy();
    expect(zip.file('word/header1.xml')).toBeTruthy();
    expect(documentXml).toContain('Title of your essay : A Better School Day');
    expect(documentXml).toContain('1. Students need more sleep.');
    expect(documentXml).toContain('School should start later for healthier learning.');
    expect(documentXml).toContain('ESSAY');
    expect(documentXml).toContain('A later school day can help students focus.');
    expect(documentXml).not.toContain('<w:tblpPr');
  });
});
