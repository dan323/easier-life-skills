import stem from 'wink-porter2-stemmer';

export const STOPWORDS = new Set([
  // Common English function words
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'for','to','of','in','with','that','this','it','by','from','on',
  'and','or','not','as','at','but','if','so','your','can','its',
  'their','our','any','all','each','every','some','into','use','using',
  'you','we','they','he','she','who','what','which','how','when',
  'get','set','run','add','new','one','two','per','via',
  // Domain noise — universal in a skills marketplace, discriminate nothing.
  // Type nouns: every entity IS a skill/plugin/agent, so these never narrow results.
  'skill','plugin','claude','tool','agent','want','need','look','find','help',
]);

const segmenter = new Intl.Segmenter('en', { granularity: 'word' });

export function tokenize(text: string): string[] {
  return [...segmenter.segment(text.toLowerCase())]
    .filter(s => s.isWordLike)
    .map(s => s.segment)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t))
    .map(stem)
    .filter(t => !STOPWORDS.has(t));
}
