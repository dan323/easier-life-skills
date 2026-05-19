export interface UrlState {
  view:   string;
  query:  string;
  sort:   'az' | 'za';
  repos:  string[];
  cats:   string[];
  bundle: string[];   // encoded as "name|installCommand" pairs
}

export function readUrlState(): UrlState {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    view:   params.get('view') ?? 'plugins',
    query:  params.get('q')    ?? '',
    sort:   (params.get('sort') ?? 'az') as 'az' | 'za',
    repos:  params.getAll('repo'),
    cats:   params.getAll('cat'),
    bundle: params.getAll('b'),
  };
}

export function writeUrlState(s: UrlState): void {
  const params = new URLSearchParams();
  if (s.view !== 'plugins') params.set('view', s.view);
  if (s.query)              params.set('q', s.query);
  if (s.sort !== 'az')      params.set('sort', s.sort);
  for (const repo   of s.repos)  params.append('repo', repo);
  for (const cat    of s.cats)   params.append('cat',  cat);
  for (const item   of s.bundle) params.append('b',    item);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `#${qs}` : location.pathname + location.search);
}
