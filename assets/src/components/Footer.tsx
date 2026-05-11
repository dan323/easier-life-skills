interface Props {
  generated?: string;
}

export function Footer({ generated }: Props) {
  const text = generated
    ? new Date(generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '…';
  return (
    <footer>
      <span>Updated <span id="generated" aria-live="polite">{text}</span></span>
      <span>
        <a href="https://github.com/dan323/easier-life-skills/blob/master/CATALOG.md" target="_blank" rel="noopener" aria-label="Full catalog (opens in new tab)">Full catalog</a>{' · '}
        <a href="https://github.com/dan323/easier-life-skills/blob/master/docs/contributing.md" target="_blank" rel="noopener">Contribute</a>{' · '}
        <a href="https://github.com/dan323/easier-life-skills" target="_blank" rel="noopener">GitHub</a>
      </span>
    </footer>
  );
}
