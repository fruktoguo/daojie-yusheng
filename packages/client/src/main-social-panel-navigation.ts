/** 统一协调「队伍 + 四个道友子页」固定尺寸独立面板的互斥显示。 */
import type { SocialPanel } from './ui/panels/social-panel';
import type { PartyWorkspacePanel } from './ui/party-workspace-panel';

type MainSocialPanelNavigationOptions = {
  socialPanel: SocialPanel;
  partyPanel: PartyWorkspacePanel;
};

export type MainSocialPanelNavigation = {
  openPartyPanel(opener?: HTMLElement | null): void;
};

export function bindMainSocialPanelNavigation(
  options: MainSocialPanelNavigationOptions,
): MainSocialPanelNavigation {
  const { socialPanel, partyPanel } = options;
  const refreshLauncher = () => socialPanel.refreshFeatureLauncherState();
  const openPartyPanel = (opener: HTMLElement | null = null): void => {
    socialPanel.closeFeaturePanels('party');
    partyPanel.open(opener);
    refreshLauncher();
  };

  socialPanel.setFeaturePanelOpenHandler(() => partyPanel.close(false));
  socialPanel.setPartyPanelOpenStateReader(() => partyPanel.isOpen());
  socialPanel.setPartyOpenHandler(openPartyPanel);
  partyPanel.setVisibilityChangeHandler(refreshLauncher);

  return { openPartyPanel };
}
