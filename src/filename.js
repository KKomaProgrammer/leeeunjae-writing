export const DEFAULT_FILE_NAME = '작문 파일 format.docx';

export function sanitizeFilePart(value) {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withSuffix(value, suffix) {
  const clean = sanitizeFilePart(value).replace(new RegExp(`${suffix}+$`), '');
  return clean ? `${clean}${suffix}` : '';
}

export function hasCompleteCustomName(meta) {
  return Boolean(
    sanitizeFilePart(meta.className) &&
      sanitizeFilePart(meta.studentName) &&
      sanitizeFilePart(meta.round),
  );
}

export function makeDocxFileName(meta, useCustomName) {
  if (!useCustomName || !hasCompleteCustomName(meta)) return DEFAULT_FILE_NAME;

  const className = withSuffix(meta.className, '반');
  const studentName = sanitizeFilePart(meta.studentName);
  const round = withSuffix(meta.round, '회');
  return `${className}_${studentName}_${round}_작문.docx`;
}
