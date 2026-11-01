interface Props {
  /** DOM id prefix, e.g. `entity-panel` → `entity-panel-preview-section`. */
  idPrefix: string;
  /** Raw SKILL.md excerpt from the index. Untrusted text. */
  excerpt:  string | undefined;
  /** Shown next to the title when the preview belongs to a named skill (plugin panel). */
  skillName?: string;
  /** Link to the full SKILL.md. */
  href?:    string | null;
}

/**
 * Truncated SKILL.md preview. The excerpt comes from third-party repos, so it
 * is passed to Preact as a text child (escaped) inside a <pre>, never through
 * dangerouslySetInnerHTML or a markdown renderer.
 */
export function SkillPreview({ idPrefix, excerpt, skillName, href }: Props) {
  if (!excerpt) return null;
  return (
    <div id={`${idPrefix}-preview-section`} class="panel-section panel-preview-section">
      <h3 class="panel-section-title">
        SKILL.md preview
        {skillName && <> <span id={`${idPrefix}-preview-skill`} class="panel-count">{skillName}</span></>}
      </h3>
      <pre id={`${idPrefix}-preview`} class="panel-preview">{excerpt}</pre>
      {href && (
        <a id={`${idPrefix}-preview-link`} href={href} target="_blank" rel="noopener" class="panel-source-link">
          View full SKILL.md
        </a>
      )}
    </div>
  );
}
