/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
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
