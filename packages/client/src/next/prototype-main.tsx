import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/ui-primitives.css';
import '../styles/ui-modal.css';
import '../styles/ui-shells.css';
import '../styles/ui-recipes.css';
import './styles/index.css';
import './prototype/reset.css';
import { initializeUiStyleConfig } from '../ui/ui-style-config';
import { PrototypeApp } from './prototype/PrototypeApp';

initializeUiStyleConfig();

const rootElement = document.getElementById('react-ui-prototype-root');

if (!rootElement) {
  throw new Error('react-ui-prototype-root is missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <PrototypeApp />
  </StrictMode>,
);
