import { BUILTIN_REPO } from '../constants.ts';
import type { Rating } from '../types.ts';

export function starsString(score: number): string {
  const filled = Math.round(score);
  return Array.from({ length: 5 }, (_, i) => i < filled ? '★' : '☆').join('');
}

/** Aggregate star row — avg score + review count. */
function StarRow({ avg, count, summaryId }: { avg: number; count: number; summaryId: string }) {
  return (
    <div id={summaryId} class="panel-rating-summary" aria-label={`Average rating ${avg} out of 5 from ${count} review${count !== 1 ? 's' : ''}`}>
      <span class="panel-rating-stars" aria-hidden="true">{starsString(avg)}</span>
      <span class="panel-rating-avg">{avg}</span>
      <span class="panel-rating-count">({count} review{count !== 1 ? 's' : ''})</span>
    </div>
  );
}

interface Props {
  rating:     Rating | undefined;
  /** Pre-built URL for the "Rate this" link — caller supplies entity-specific params. */
  rateUrl:    string;
  /** Prefix used for element IDs so the block can appear in both EntityPanel and PluginPanel. */
  idPrefix:   string;
}

/**
 * Reviews section shared between EntityPanel (skills, agents, hooks, …) and
 * PluginPanel. Shows aggregate stars + individual reviews when rated, or a
 * "No reviews yet" message otherwise. Always renders the "Rate this ↗" link.
 */
export function ReviewsBlock({ rating, rateUrl, idPrefix }: Props) {
  return (
    <div id={`${idPrefix}-ratings-section`} class="panel-section">
      <h3 class="panel-section-title">Reviews</h3>
      {rating ? (
        <>
          <StarRow avg={rating.avg} count={rating.count} summaryId={`${idPrefix}-rating-summary`} />
          <div id={`${idPrefix}-reviews-list`} class="panel-reviews">
            {rating.reviews.map((r, i) => (
              <div key={i} class="panel-review">
                <div class="panel-review-header">
                  <span class="panel-review-stars" aria-label={`${r.stars} out of 5 stars`} aria-hidden="true">
                    {starsString(r.stars)}
                  </span>
                  <span class="panel-review-author">{r.author}</span>
                  <span class="panel-review-date">{r.date.slice(0, 10)}</span>
                </div>
                {r.body && <p class="panel-review-body">{r.body}</p>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p id={`${idPrefix}-no-reviews`} class="panel-no-reviews">No reviews yet.</p>
      )}
      <a
        id={`${idPrefix}-rate-link`}
        class="panel-rate-link"
        href={rateUrl}
        target="_blank"
        rel="noopener"
      >
        Rate this ↗
      </a>
    </div>
  );
}

/** Build the "Rate this" URL for any entity, pre-filling the Discussion form fields. */
export function rateUrl(opts: {
  entityType: string;
  entityName: string;
  entityRepo: string;
}): string {
  const params = new URLSearchParams({
    category:    'ratings',
    title:       `[Review] ${opts.entityName}`,
    entity_type: opts.entityType,
    entity_name: opts.entityName,
    entity_repo: opts.entityRepo,
  });
  return `https://github.com/${BUILTIN_REPO}/discussions/new?${params.toString()}`;
}
