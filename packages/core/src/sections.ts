export const SECTIONS = [
  { id: 'law', name: 'Law' },
  { id: 'history', name: 'History' },
  { id: 'wisdom', name: 'Wisdom & Poetry' },
  { id: 'major-prophets', name: 'Major Prophets' },
  { id: 'minor-prophets', name: 'Minor Prophets' },
  { id: 'gospels-acts', name: 'Gospels & Acts' },
  { id: 'epistles', name: 'Epistles' },
  { id: 'apocalypse', name: 'Apocalypse' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
