/**
 * MainDomElements：统一结构类型，保证协议与运行时一致性。
 */
export type MainDomElements = {
/**
 * canvasHost：对象字段。
 */

  canvasHost: HTMLElement;  
  /**
 * zoomSlider：对象字段。
 */

  zoomSlider: HTMLInputElement | null;  
  /**
 * zoomLevelEl：对象字段。
 */

  zoomLevelEl: HTMLElement | null;  
  /**
 * tickRateEl：对象字段。
 */

  tickRateEl: HTMLElement | null;  
  /**
 * currentTimeEl：对象字段。
 */

  currentTimeEl: HTMLElement | null;  
  /**
 * currentTimePhaseEl：对象字段。
 */

  currentTimePhaseEl: HTMLElement | null;  
  /**
 * currentTimeHourAEl：对象字段。
 */

  currentTimeHourAEl: HTMLElement | null;  
  /**
 * currentTimeHourBEl：对象字段。
 */

  currentTimeHourBEl: HTMLElement | null;  
  /**
 * currentTimeDotEl：对象字段。
 */

  currentTimeDotEl: HTMLElement | null;  
  /**
 * currentTimeMinAEl：对象字段。
 */

  currentTimeMinAEl: HTMLElement | null;  
  /**
 * currentTimeMinBEl：对象字段。
 */

  currentTimeMinBEl: HTMLElement | null;  
  /**
 * tickRateIntEl：对象字段。
 */

  tickRateIntEl: HTMLElement | null;  
  /**
 * tickRateDotEl：对象字段。
 */

  tickRateDotEl: HTMLElement | null;  
  /**
 * tickRateFracAEl：对象字段。
 */

  tickRateFracAEl: HTMLElement | null;  
  /**
 * tickRateFracBEl：对象字段。
 */

  tickRateFracBEl: HTMLElement | null;  
  /**
 * fpsRateEl：对象字段。
 */

  fpsRateEl: HTMLElement | null;  
  /**
 * fpsValueEl：对象字段。
 */

  fpsValueEl: HTMLElement | null;  
  /**
 * fpsLowValueEl：对象字段。
 */

  fpsLowValueEl: HTMLElement | null;  
  /**
 * fpsOnePercentValueEl：对象字段。
 */

  fpsOnePercentValueEl: HTMLElement | null;  
  /**
 * pingLatencyEl：对象字段。
 */

  pingLatencyEl: HTMLElement | null;  
  /**
 * pingUnitEl：对象字段。
 */

  pingUnitEl: HTMLElement | null;  
  /**
 * pingHundredsEl：对象字段。
 */

  pingHundredsEl: HTMLElement | null;  
  /**
 * pingTensEl：对象字段。
 */

  pingTensEl: HTMLElement | null;  
  /**
 * pingOnesEl：对象字段。
 */

  pingOnesEl: HTMLElement | null;  
  /**
 * joinQqGroupBtns：对象字段。
 */

  joinQqGroupBtns: NodeListOf<HTMLAnchorElement>;  
  /**
 * targetingBadgeEl：对象字段。
 */

  targetingBadgeEl: HTMLElement | null;  
  /**
 * observeModalEl：对象字段。
 */

  observeModalEl: HTMLElement | null;  
  /**
 * observeModalBodyEl：对象字段。
 */

  observeModalBodyEl: HTMLElement | null;  
  /**
 * observeModalSubtitleEl：对象字段。
 */

  observeModalSubtitleEl: HTMLElement | null;  
  /**
 * observeModalShellEl：对象字段。
 */

  observeModalShellEl: HTMLElement | null;  
  /**
 * observeModalAsideEl：对象字段。
 */

  observeModalAsideEl: HTMLElement | null;
};

export const QQ_GROUP_NUMBER = '940886387';
export const QQ_GROUP_MOBILE_DEEP_LINK = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP_NUMBER}&card_type=group&source=qrcode`;
export const QQ_GROUP_DESKTOP_DEEP_LINK = `tencent://AddContact/?fromId=45&fromSubId=1&subcmd=all&uin=${QQ_GROUP_NUMBER}`;
/**
 * collectMainDomElements：执行核心业务逻辑。
 * @param documentRef Document 参数说明。
 * @returns MainDomElements。
 */


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
