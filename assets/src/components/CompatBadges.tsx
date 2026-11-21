import type { AiTool } from '../types.ts';

const LABELS: Record<AiTool, string> = { claude: 'Claude', copilot: 'Copilot', other: 'Others' };

/** Small badges listing the AI tools an entity works with. Renders nothing when unknown. */
export function CompatBadges({ tools }: { tools?: AiTool[] }) {
  if (!tools || tools.length === 0) return null;
  return (
    <>
      {tools.filter(t => t in LABELS).map(t => (
        <span key={t} class={`badge badge-compat badge-compat-${t}`} title={`Compatible with ${LABELS[t]}`}>{LABELS[t]}</span>
      ))}
    </>
  );
}
