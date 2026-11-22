import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../renderer/styles/global.css';
import '../renderer/styles/map.css';
import './page.css';
import './web.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
