import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyPlatformClass } from './platform';
import './styles/global.css';
import './styles/shell.css';
import './styles/compendium.css';
import './styles/map.css';
import './styles/responsive.css';

/**
 * The renderer's entry point for both windows: it loads the stylesheets in cascade order, marks
 * the document with the platform (ADR 0006) before anything renders, and mounts `App`, which
 * picks the console or the player from the hash route (ADR 0002). Nothing else happens here.
 */

applyPlatformClass();

const container = document.getElementById('root');
if (!container) throw new Error('missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
