export function sourceTag(ownerRepo: string, builtin: boolean): HTMLElement {
  const tag = document.createElement('div');
  tag.className = 'source-tag' + (builtin ? ' builtin' : '');
  tag.dataset['repo'] = ownerRepo;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'loading…';
  tag.appendChild(label);

  return tag;
}
