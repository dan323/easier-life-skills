import { state } from './state.ts';

export function syncStateToUrl(): void {
  const params = new URLSearchParams();
  if (state.view !== 'plugins') params.set('view', state.view);
  if (state.query)              params.set('q', state.query);
  for (const repo of state.activeRepos)      params.append('repo', repo);
  for (const cat  of state.activeCategories) params.append('cat',  cat);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `#${qs}` : location.pathname + location.search);
}

export function readUrlState(): { view: string; query: string; repos: string[]; cats: string[] } {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    view:  params.get('view') ?? 'plugins',
    query: params.get('q')    ?? '',
    repos: params.getAll('repo'),
    cats:  params.getAll('cat'),
  };
}
