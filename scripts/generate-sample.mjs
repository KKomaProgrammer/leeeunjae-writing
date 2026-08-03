import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildDocxBlobFromBytes } from '../src/docx.js';
import { EMPTY_DRAFT } from '../src/schema.js';

const template = await readFile(new URL('../public/writing-template.docx', import.meta.url));
const blob = await buildDocxBlobFromBytes(template, {
  ...EMPTY_DRAFT,
  title: 'A Better School Day',
  attentionGrabber: 'What if school began one hour later?',
  introMain1: 'Students need more sleep.',
  introMain2: 'They can focus better in class.',
  introMain3: 'A later start supports student health.',
  thesisStatement: 'Schools should start later because rested students learn better.',
  body1Topic: 'First, enough sleep improves attention.',
  body1Reason1: 'Tired students have difficulty listening for a full lesson.',
  body1Reason2: 'Rested students can remember new information more easily.',
  body2Topic: 'Second, a later start supports physical and mental health.',
  body2Reason1: 'Students can follow a healthier sleep schedule.',
  body2Reason2: 'They arrive at school with less stress.',
  body3Topic: 'Finally, families can prepare for school more calmly.',
  body3Reason1: 'Students have time to eat breakfast.',
  body3Reason2: 'They are less likely to rush or forget materials.',
  conclusionThesis: 'Starting later would create a healthier learning environment.',
  conclusionMain1: 'Better attention',
  conclusionMain2: 'Improved health',
  conclusionMain3: 'Calmer mornings',
  application: 'Schools can test a later schedule and compare student results.',
  essay:
    'What if school began one hour later? Many students arrive in class already tired. A later start could give them the rest they need to learn well.\n\nFirst, enough sleep improves attention. Tired students often have difficulty listening for a full lesson, while rested students can remember new information more easily.\n\nSecond, a later start supports physical and mental health. Students can follow a healthier sleep schedule and arrive at school with less stress.\n\nFinally, families can prepare for school more calmly. Students have time to eat breakfast and are less likely to forget materials.\n\nFor these reasons, schools should consider starting later. A small schedule change could create healthier, more focused classrooms.',
});

await mkdir(new URL('../test-output/', import.meta.url), { recursive: true });
await writeFile(new URL('../test-output/filled-sample.docx', import.meta.url), Buffer.from(await blob.arrayBuffer()));
