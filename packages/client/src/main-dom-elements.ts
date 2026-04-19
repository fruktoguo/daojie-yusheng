export type MainDomElements = {
  canvasHost: HTMLElement;
  zoomSlider: HTMLInputElement | null;
  zoomLevelEl: HTMLElement | null;
  tickRateEl: HTMLElement | null;
  currentTimeEl: HTMLElement | null;
  currentTimePhaseEl: HTMLElement | null;
  currentTimeHourAEl: HTMLElement | null;
  currentTimeHourBEl: HTMLElement | null;
  currentTimeDotEl: HTMLElement | null;
  currentTimeMinAEl: HTMLElement | null;
  currentTimeMinBEl: HTMLElement | null;
  tickRateIntEl: HTMLElement | null;
  tickRateDotEl: HTMLElement | null;
  tickRateFracAEl: HTMLElement | null;
  tickRateFracBEl: HTMLElement | null;
  fpsRateEl: HTMLElement | null;
  fpsValueEl: HTMLElement | null;
  fpsLowValueEl: HTMLElement | null;
  fpsOnePercentValueEl: HTMLElement | null;
  pingLatencyEl: HTMLElement | null;
  pingUnitEl: HTMLElement | null;
  pingHundredsEl: HTMLElement | null;
  pingTensEl: HTMLElement | null;
  pingOnesEl: HTMLElement | null;
  joinQqGroupBtns: NodeListOf<HTMLAnchorElement>;
  targetingBadgeEl: HTMLElement | null;
  observeModalEl: HTMLElement | null;
  observeModalBodyEl: HTMLElement | null;
  observeModalSubtitleEl: HTMLElement | null;
  observeModalShellEl: HTMLElement | null;
  observeModalAsideEl: HTMLElement | null;
};

export const QQ_GROUP_NUMBER = '940886387';
export const QQ_GROUP_MOBILE_DEEP_LINK = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP_NUMBER}&card_type=group&source=qrcode`;
export const QQ_GROUP_DESKTOP_DEEP_LINK = `tencent://AddContact/?fromId=45&fromSubId=1&subcmd=all&uin=${QQ_GROUP_NUMBER}`;

export function collectMainDomElements(documentRef: Document): MainDomElements {
  const currentTimeValueEl = documentRef.getElementById('map-current-time-value');
  const tickRateValueEl = documentRef.getElementById('map-tick-rate-value');
  const pingValueEl = documentRef.getElementById('map-ping-value');
  const observeModalEl = documentRef.getElementById('observe-modal');

  return {
    canvasHost: documentRef.getElementById('game-stage') as HTMLElement,
    zoomSlider: documentRef.getElementById('zoom-slider') as HTMLInputElement | null,
    zoomLevelEl: documentRef.getElementById('zoom-level'),
    tickRateEl: documentRef.getElementById('map-tick-rate'),
    currentTimeEl: documentRef.getElementById('map-current-time'),
    currentTimePhaseEl: documentRef.getElementById('map-current-time-phase'),
    currentTimeHourAEl: currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-a"]') ?? null,
    currentTimeHourBEl: currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-b"]') ?? null,
    currentTimeDotEl: currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="dot"]') ?? null,
    currentTimeMinAEl: currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-a"]') ?? null,
    currentTimeMinBEl: currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-b"]') ?? null,
    tickRateIntEl: tickRateValueEl?.querySelector<HTMLElement>('[data-part="int"]') ?? null,
    tickRateDotEl: tickRateValueEl?.querySelector<HTMLElement>('[data-part="dot"]') ?? null,
    tickRateFracAEl: tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-a"]') ?? null,
    tickRateFracBEl: tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-b"]') ?? null,
    fpsRateEl: documentRef.getElementById('map-fps-rate'),
    fpsValueEl: documentRef.getElementById('map-fps-value'),
    fpsLowValueEl: documentRef.getElementById('map-fps-low-value'),
    fpsOnePercentValueEl: documentRef.getElementById('map-fps-one-percent-value'),
    pingLatencyEl: documentRef.getElementById('map-ping-rate'),
    pingUnitEl: documentRef.getElementById('map-ping-unit'),
    pingHundredsEl: pingValueEl?.querySelector<HTMLElement>('[data-ping-part="hundreds"]') ?? null,
    pingTensEl: pingValueEl?.querySelector<HTMLElement>('[data-ping-part="tens"]') ?? null,
    pingOnesEl: pingValueEl?.querySelector<HTMLElement>('[data-ping-part="ones"]') ?? null,
    joinQqGroupBtns: documentRef.querySelectorAll<HTMLAnchorElement>('[data-qq-group-link="true"]'),
    targetingBadgeEl: documentRef.getElementById('map-targeting-indicator'),
    observeModalEl,
    observeModalBodyEl: documentRef.getElementById('observe-modal-body'),
    observeModalSubtitleEl: documentRef.getElementById('observe-modal-subtitle'),
    observeModalShellEl: observeModalEl?.querySelector('.observe-modal-shell') as HTMLElement | null,
    observeModalAsideEl: documentRef.getElementById('observe-modal-aside'),
  };
}
