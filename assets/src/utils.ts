export function titleCase(str: string): string {
  return str.replace(/-/g, ' ').replace(/(^|\s)\w/g, c => c.toUpperCase());
}

export function copyText(text: string, btn: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1800);
  });
}

export function makeExpandable<T>(
  container: HTMLElement,
  items: T[],
  limit: number,
  renderItem: (item: T) => HTMLElement,
): void {
  let expanded = false;
  function draw(): void {
    container.innerHTML = '';
    (expanded ? items : items.slice(0, limit)).forEach(item => container.appendChild(renderItem(item)));
    if (items.length > limit) {
      const btn = document.createElement('button');
      btn.className = 'expand-btn';
      btn.textContent = expanded ? 'Show less' : `+${items.length - limit} more`;
      btn.addEventListener('click', e => { e.stopPropagation(); expanded = !expanded; draw(); });
      container.appendChild(btn);
    }
  }
  draw();
}
