export function titleCase(str: string): string {
  return str.replace(/-/g, ' ').replace(/(^|\s)\w/g, c => c.toUpperCase());
}

export function copyText(text: string, btn: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    const announce = document.getElementById('sr-announce');
    if (announce) { announce.textContent = 'Command copied to clipboard'; }
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
      if (announce) { announce.textContent = ''; }
    }, 3000);
  });
}

export function makeExpandable<T>(
  container: HTMLElement,
  items: T[],
  limit: number,
  renderItem: (item: T) => HTMLElement,
  itemType = 'more',
): void {
  let expanded = false;
  function draw(): void {
    container.innerHTML = '';
    (expanded ? items : items.slice(0, limit)).forEach(item => container.appendChild(renderItem(item)));
    if (items.length > limit) {
      const btn = document.createElement('button');
      btn.className = 'expand-btn';
      btn.textContent = expanded ? 'Show less' : `+${items.length - limit} ${itemType}`;
      btn.addEventListener('click', e => { e.stopPropagation(); expanded = !expanded; draw(); });
      container.appendChild(btn);
    }
  }
  draw();
}

const RUNTIME_LABELS: Record<string, string> = {
  npx:    'Node.js (npm)',
  npm:    'Node.js (npm)',
  node:   'Node.js',
  bunx:   'Bun',
  bun:    'Bun',
  deno:   'Deno',
  uvx:    'Python (uv)',
  uv:     'Python (uv)',
  pipx:   'Python (pipx)',
  python: 'Python',
  python3: 'Python',
  docker: 'Docker',
  podman: 'Podman',
};

/** Human-readable runtime an MCP server's launch command needs, or null if unknown. */
export function mcpRuntimeLabel(command: string): string | null {
  const exe = command.trim().split(/\s+/)[0]?.split(/[\/]/).pop()?.replace(/\.(exe|cmd)$/i, '').toLowerCase();
  return (exe && RUNTIME_LABELS[exe]) || null;
}
