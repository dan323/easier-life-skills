import { describe, it, expect } from 'vitest';
import { render } from 'preact';
import { CompatBadges } from '../assets/src/components/CompatBadges.tsx';
import { COMPATIBILITY } from '../scripts/lib/compatibility.ts';

describe('CompatBadges', () => {
  it('renders one badge per tool', () => {
    const el = document.createElement('div');
    render(<CompatBadges tools={['claude', 'copilot', 'other']} />, el);
    expect([...el.querySelectorAll('.badge-compat')].map(b => b.textContent)).toEqual(['Claude', 'Copilot', 'Others']);
  });
  it('renders nothing without data', () => {
    const el = document.createElement('div');
    render(<CompatBadges />, el);
    expect(el.innerHTML).toBe('');
  });
  it('marks Claude-specific formats as Claude only', () => {
    expect(COMPATIBILITY.agent).toEqual(['claude']);
    expect(COMPATIBILITY.skill).toContain('copilot');
  });
});
