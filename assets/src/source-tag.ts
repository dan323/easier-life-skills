export interface SourceTagElements {
  root:    HTMLElement;
  label:   HTMLElement;
  copyBtn: HTMLButtonElement;
}

export function sourceTag(ownerRepo: string, builtin: boolean): SourceTagElements {
  const root = document.createElement('div');
  root.className = 'source-tag' + (builtin ? ' builtin' : '');
  root.dataset['repo'] = ownerRepo;
  root.setAttribute('role', 'button');
  root.setAttribute('tabindex', '0');
  root.setAttribute('aria-pressed', 'false');

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'loading…';
  root.appendChild(label);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'source-add-copy';
  copyBtn.title = `Copy "/plugin marketplace add ${ownerRepo}"`;
  copyBtn.setAttribute('aria-label', `Copy marketplace add command for ${ownerRepo}`);
  copyBtn.textContent = '+';
  copyBtn.hidden = true;
  root.appendChild(copyBtn);

  return { root, label, copyBtn };
}
