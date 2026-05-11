interface Props {
  count: number;
}

export function Header({ count }: Props) {
  return (
    <header>
      <div class="header-left">
        <h1>
          <a href="." class="home-link">
            easier-life-<span>skills</span>
          </a>
        </h1>
        <p>
          A Claude Code skill marketplace ·{' '}
          <span id="skill-count" aria-live="polite" aria-atomic="true">{String(count)}</span>{' '}
          items loaded
        </p>
      </div>
      <div class="header-right">
        <a
          class="btn-gh"
          href="https://github.com/dan323/easier-life-skills"
          target="_blank"
          rel="noopener"
          aria-label="GitHub (opens in new tab)"
        >
          <span aria-hidden="true">★</span> GitHub
        </a>
      </div>
    </header>
  );
}
