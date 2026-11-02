interface Props {
  /** DOM id prefix, e.g. `entity-panel` → `entity-panel-preview-section`. */
  idPrefix:  string;
  /** Raw markdown excerpt from the index. Untrusted text. */
  excerpt:   string | undefined;
  /** What the file is called in the UI: `SKILL.md`, `agent file`, `command file`. */
  fileLabel: string;
  /** True when the excerpt is only the beginning of the file. */
  truncated?: boolean;
  /** Link to the full file. */
  href?:     string | null;
}

/**
 * Truncated file preview. The excerpt comes from third-party repos, so it
 * is passed to Preact as a text child (escaped) inside a <pre>, never through
 * dangerouslySetInnerHTML or a markdown renderer.
 *
 * When the excerpt is not the whole file the section says so explicitly (a
 * "Partial" badge above, a note and the full-file link below) so it cannot be
 * mistaken for the complete content.
 */
export function SkillPreview({ idPrefix, excerpt, fileLabel, truncated, href }: Props) {
  if (!excerpt) return null;
  return (
    <div id={`${idPrefix}-preview-section`} class="panel-section panel-preview-section">
      <h3 class="panel-section-title">
        Preview of {fileLabel}
        <span id={`${idPrefix}-preview-badge`} class={`panel-preview-badge${truncated ? ' partial' : ''}`}>
          {truncated ? 'Partial' : 'Full file'}
        </span>
      </h3>
      <pre id={`${idPrefix}-preview`} class={`panel-preview${truncated ? ' truncated' : ''}`}>{excerpt}</pre>
      {truncated && (
        <p id={`${idPrefix}-preview-note`} class="panel-preview-note">
          Only the beginning of the file is shown — the rest is not included in this preview.
        </p>
      )}
      {href && (
        <a id={`${idPrefix}-preview-link`} href={href} target="_blank" rel="noopener" class="panel-source-link">
          {truncated ? `View full ${fileLabel} →` : `Open ${fileLabel}`}
        </a>
      )}
    </div>
  );
}
