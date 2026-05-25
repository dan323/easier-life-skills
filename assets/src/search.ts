import { tokenize } from '../../shared/search-tokenize.ts';

export { tokenize };

type InvertedIndex = Record<string, [string, number][]>;

let indexCache: InvertedIndex | null = null;
let inflightFetch: Promise<InvertedIndex> | null = null;

function loadIndex(): Promise<InvertedIndex> {
  if (indexCache) return Promise.resolve(indexCache);
  if (!inflightFetch) {
    inflightFetch = fetch('./assets/search-index.json')
      .then(r => {
        if (!r.ok) return {} as InvertedIndex;
        return r.json() as Promise<InvertedIndex>;
      })
      .then(data => { indexCache = data; return data; })
      .catch(() => { inflightFetch = null; return {} as InvertedIndex; });
  }
  return inflightFetch;
}

export async function nlSearch(query: string): Promise<Map<string, number>> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return new Map();

  const idx = await loadIndex();
  const scores = new Map<string, number>();

  for (const token of tokens) {
    for (const [id, score] of idx[token] ?? []) {
      scores.set(id, (scores.get(id) ?? 0) + score);
    }
  }

  return scores;
}

export function isNLQuery(query: string): boolean {
  return query.includes(' ');
}
