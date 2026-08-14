/** 将队伍与道友固定页接入 SidePanel 的统一互斥切换生命周期。 */
import type { SidePanel, SidePanelTabTransition } from './ui/side-panel';
import type { SocialPanel } from './ui/panels/social-panel';

type MainSocialPanelNavigationOptions = {
  documentRef: Document;
  sidePanel: SidePanel;
  socialPanel: SocialPanel;
  openPartyPanel(): void;
};

const RIGHT_TOP_GROUP_ID = 'right-top';

export function bindMainSocialPanelNavigation(options: MainSocialPanelNavigationOptions): void {
  const { documentRef, sidePanel, socialPanel, openPartyPanel } = options;
  const focusPartyInitialControl = (): void => {
    let attempts = 0;
    const focus = (): void => {
      const pane = documentRef.getElementById('pane-party');
      if (pane?.classList.contains('active')) {
        pane.querySelector<HTMLButtonElement>('[data-party-fixed-back="true"], [data-party-tab]')
          ?.focus({ preventScroll: true });
        return;
      }
      attempts += 1;
      if (attempts < 3) window.requestAnimationFrame(focus);
    };
    window.requestAnimationFrame(focus);
  };
  const isRightTop = (transition: SidePanelTabTransition): boolean => (
    transition.groupId === RIGHT_TOP_GROUP_ID
  );

  sidePanel.addTabTransitionListener({
    beforeTabChange: (transition) => {
      if (!isRightTop(transition)) return;
      socialPanel.handleFixedPanelTabWillChange(transition.previousTabName, transition.tabName);
    },
    afterTabChange: (transition) => {
      if (!isRightTop(transition)) return;
      const focusInitial = !transition.initializing;
      socialPanel.handleFixedPanelTabDidChange(transition.previousTabName, transition.tabName, focusInitial);
      if (transition.tabName === 'party' && focusInitial) focusPartyInitialControl();
    },
  });
  socialPanel.setFixedPanelOpenHandler((panelId) => sidePanel.switchTab(panelId));
  socialPanel.setPartyOpenHandler(openPartyPanel);
  documentRef.querySelector<HTMLElement>('[data-party-fixed-back="true"]')?.addEventListener('click', () => {
    sidePanel.switchTab('social');
  });
}
