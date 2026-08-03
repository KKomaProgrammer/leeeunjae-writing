import { describe, expect, it } from 'vitest';
import { extractUploadForm } from '../functions/api/submit.js';

describe('remote upload form extraction', () => {
  it('keeps hidden fields and detects the DOCX input name', () => {
    const form = extractUploadForm(`
      <form method="post" action="m_sr01_form_proc.asp">
        <input type="hidden" name="mode" value="write">
        <input name="teacher" type="hidden" value="A&amp;B">
        <input type="file" name="strFile">
      </form>
    `);

    expect(form.action).toBe(
      'https://m10.hakwonsarang.co.kr/m/acam_module/SED3/m_sr01_form_proc.asp',
    );
    expect(form.fileField).toBe('strFile');
    expect(form.hiddenFields).toEqual([
      ['mode', 'write'],
      ['teacher', 'A&B'],
    ]);
  });

  it('uses the explicit fallback when the remote page does not expose a file field', () => {
    const form = extractUploadForm('<html><body>empty</body></html>');
    expect(form.fileField).toBe('file1');
  });
});
