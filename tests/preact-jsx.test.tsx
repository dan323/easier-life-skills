import { describe, it, expect } from 'vitest';
import { render } from 'preact';

function Hello({ name }: { name: string }) {
  return <p id="hello">Hello {name}</p>;
}

describe('preact JSX', () => {
  it('compiles and renders TSX components', () => {
    document.body.innerHTML = '<div id="root"></div>';
    render(<Hello name="World" />, document.getElementById('root')!);
    expect(document.getElementById('hello')?.textContent).toBe('Hello World');
  });
});
