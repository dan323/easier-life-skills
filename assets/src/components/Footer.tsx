interface Props {
  generated?:       string;
  onManageConsent?: () => void;
}

export function Footer({ generated, onManageConsent }: Props) {
  const text = generated
    ? new Date(generated).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '…';
  return (
    <footer>
      <span>Updated <span id="generated" aria-live="polite">{text}</span></span>
      <span>
        <a href="./catalog.html" aria-label="Full catalog">Full catalog</a>{' · '}
        <a href="https://github.com/dan323/easier-life-skills/blob/master/docs/contributing.md" target="_blank" rel="noopener">Contribute</a>{' · '}
        <a href="https://github.com/dan323/easier-life-skills" target="_blank" rel="noopener">GitHub</a>
        {onManageConsent && (
          <>{' · '}<button
            type="button"
            id="manage-consent"
            class="footer-link-btn"
            onClick={onManageConsent}
          >Manage analytics consent</button></>
        )}
      </span>
    </footer>
  );
}
