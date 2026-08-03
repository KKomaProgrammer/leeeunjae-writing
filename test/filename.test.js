import { describe, expect, it } from 'vitest';
import { DEFAULT_FILE_NAME, hasCompleteCustomName, makeDocxFileName } from '../src/filename.js';

describe('DOCX file naming', () => {
  it('uses the required default name', () => {
    expect(makeDocxFileName({}, false)).toBe(DEFAULT_FILE_NAME);
  });

  it('requires all three optional values before custom naming is available', () => {
    expect(hasCompleteCustomName({ className: '66B', studentName: '이준우', round: '' })).toBe(false);
    expect(makeDocxFileName({ className: '66B', studentName: '이준우', round: '' }, true)).toBe(
      DEFAULT_FILE_NAME,
    );
  });

  it('accepts long class and round values without duplicating suffixes', () => {
    expect(
      makeDocxFileName(
        { className: 'Advanced 66B반', studentName: '이준우', round: '특별 12회' },
        true,
      ),
    ).toBe('Advanced 66B반_이준우_특별 12회_작문.docx');
  });
});
