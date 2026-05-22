/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
/**
 * 游戏客户端主入口。
 * 只保留样式注入与前台主链装配入口。
 */

import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/hud.css';
import './styles/overlays.css';
import './styles/ui-primitives.css';
import './styles/ui-modal.css';
import './styles/ui-shells.css';
import './styles/ui-recipes.css';
import './styles/panels.css';
import './styles/ui-responsive.css';
import './styles/responsive.css';

import { bindExternalLinkGuard } from './ui/external-link-guard';
import { applyStaticI18n } from './ui/i18n';
import { collectMainDomElements } from './main-dom-elements';
import { createMainFrontendModules } from './main-frontend-modules';
import { initializeMainApp } from './main-app-composition';
import { mountReactMapMinimapShell } from './react-ui/shell/MapMinimapShell';

bindExternalLinkGuard(document);
applyStaticI18n(document);
mountReactMapMinimapShell(document);

initializeMainApp({
  windowRef: window,
  documentRef: document,
  dom: collectMainDomElements(document),
  modules: createMainFrontendModules(window),
});
