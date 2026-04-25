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
import { collectMainDomElements } from './main-dom-elements';
import { createMainFrontendModules } from './main-frontend-modules';
import { initializeMainApp } from './main-app-composition';

bindExternalLinkGuard(document);

initializeMainApp({
  windowRef: window,
  documentRef: document,
  dom: collectMainDomElements(document),
  modules: createMainFrontendModules(window),
});
