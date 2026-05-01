import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/hud.css';
import './styles/foundation.css';
import './styles/index.css';
import './prototype/reset.css';
import { initializeUiStyleConfig } from '../ui/ui-style-config';
import { PrototypeApp } from './prototype/PrototypeApp';

initializeUiStyleConfig();

const rootElement = document.getElementById('react-ui-prototype-root');

if (!rootElement) {
  throw new Error('缺少 React UI 原型根节点');
}

createRoot(rootElement).render(
  <StrictMode>
    <PrototypeApp />
  </StrictMode>,
);
