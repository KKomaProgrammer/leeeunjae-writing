export const OUTLINE_FIELDS = [
  { key: 'attentionGrabber', row: 1, label: 'Introduction · Attention Grabber' },
  { key: 'introMain1', row: 2, prefix: '1. ', label: 'Introduction · Main point 1' },
  { key: 'introMain2', row: 3, prefix: '2. ', label: 'Introduction · Main point 2' },
  { key: 'introMain3', row: 4, prefix: '3. ', label: 'Introduction · Main point 3' },
  { key: 'thesisStatement', row: 5, label: 'Introduction · Thesis Statement' },
  { key: 'body1Topic', row: 6, label: 'Body 1 · Topic sentence' },
  { key: 'body1Reason1', row: 7, label: 'Body 1 · Reason/Explanation 1' },
  { key: 'body1Reason2', row: 8, label: 'Body 1 · Reason/Explanation 2' },
  { key: 'body2Topic', row: 9, label: 'Body 2 · Topic sentence' },
  { key: 'body2Reason1', row: 10, label: 'Body 2 · Reason/Explanation 1' },
  { key: 'body2Reason2', row: 11, label: 'Body 2 · Reason/Explanation 2' },
  { key: 'body3Topic', row: 12, label: 'Body 3 · Topic sentence' },
  { key: 'body3Reason1', row: 13, label: 'Body 3 · Reason/Explanation 1' },
  { key: 'body3Reason2', row: 14, label: 'Body 3 · Reason/Explanation 2' },
  { key: 'conclusionThesis', row: 15, label: 'Conclusion · Paraphrase thesis' },
  { key: 'conclusionMain1', row: 16, prefix: '1. ', label: 'Conclusion · Main point 1' },
  { key: 'conclusionMain2', row: 17, prefix: '2. ', label: 'Conclusion · Main point 2' },
  { key: 'conclusionMain3', row: 18, prefix: '3. ', label: 'Conclusion · Main point 3' },
  {
    key: 'application',
    row: 19,
    label: 'Conclusion · Application/Generalization of the Thesis',
  },
];

export const EMPTY_DRAFT = Object.freeze({
  title: '',
  essay: '',
  ...Object.fromEntries(OUTLINE_FIELDS.map(({ key }) => [key, ''])),
});
