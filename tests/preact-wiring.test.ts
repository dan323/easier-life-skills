import { describe, it, expect } from 'vitest';
import { h, render } from 'preact';

describe('preact wiring', () => {
  it('renders a Preact element into the DOM', () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById('root')!;
    render(h('p', { id: 'msg' }, 'hi'), root);
    expect(document.getElementById('msg')?.textContent).toBe('hi');
  });
});
