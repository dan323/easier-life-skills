import { render } from 'preact';
import { App } from './components/App.tsx';
import { initAnalytics } from './analytics.ts';

initAnalytics();

const root = document.getElementById('root');
if (root) render(<App />, root);
