import type { ConsentState } from '../analytics.ts';

interface Props {
  consent:  ConsentState;
  onChoice: (choice: 'granted' | 'denied') => void;
}

/**
 * Cookie / analytics consent banner. Renders only when the user has not
 * yet made a choice. Accept and Decline buttons are visually equivalent
 * (CNIL guidance: neither option may be more prominent than the other).
 */
export function ConsentBanner({ consent, onChoice }: Props) {
  if (consent !== null) return null;

  return (
    <section
      id="consent-banner"
      class="consent-banner"
      role="region"
      aria-label="Cookie and analytics consent"
    >
      <p class="consent-banner-text">
        We use Google Analytics to see which skills the community finds
        useful. The events we send carry no personal data (only the
        skill/plugin name and source), but Google itself sets a cookie
        to count returning visits, so we ask first.{' '}
        <a
          href="https://github.com/dan323/easier-life-skills/blob/master/docs/architecture.md#analytics"
          target="_blank"
          rel="noopener"
          class="consent-banner-link"
        >
          What gets collected
        </a>
      </p>
      <div class="consent-banner-actions">
        <button
          id="consent-decline"
          type="button"
          class="consent-banner-btn"
          onClick={() => onChoice('denied')}
        >
          Decline
        </button>
        <button
          id="consent-accept"
          type="button"
          class="consent-banner-btn"
          onClick={() => onChoice('granted')}
        >
          Accept analytics
        </button>
      </div>
    </section>
  );
}
