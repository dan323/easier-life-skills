export function sourceTag(ownerRepo: string, builtin: boolean): HTMLElement {
  const tag = document.createElement('button');
  tag.type = 'button';
  tag.className = 'source-tag' + (builtin ? ' builtin' : '');
  tag.dataset['repo'] = ownerRepo;
  tag.setAttribute('aria-pressed', 'false');

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'loading…';
  tag.appendChild(label);

  return tag;
}
