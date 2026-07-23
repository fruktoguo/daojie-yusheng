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
// 原 panels.css 已按面板领域拆分到 styles/panels/ 下，import 顺序按各文件首条规则在原 panels.css 中的行号排列，保持层叠顺序不变。
import './styles/panels/panel-common.css';
import './styles/panels/chat.css';
import './styles/panels/mobile-shell.css';
import './styles/panels/action-panel.css';
import './styles/panels/attributes.css';
import './styles/panels/inventory.css';
import './styles/panels/equipment.css';
import './styles/panels/technique.css';
import './styles/panels/loot.css';
import './styles/panels/heaven-gate.css';
import './styles/panels/market.css';
import './styles/panels/auction.css';
import './styles/panels/skill.css';
import './styles/panels/sect.css';
import './styles/panels/social.css';
import './styles/panels/world.css';
import './styles/panels/tutorial.css';
import './styles/panels/activity.css';
import './styles/panels/settings.css';
import './styles/panels/quest.css';
import './styles/panels/craft.css';
import './styles/panels/gm.css';
import './styles/panels/alchemy.css';
import './styles/panels/enhancement.css';
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
