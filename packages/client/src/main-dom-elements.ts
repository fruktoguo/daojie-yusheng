/**
 * MainDomElements：统一结构类型，保证协议与运行时一致性。
 */
export type MainDomElements = {
/**
 * canvasHost：canvaHost相关字段。
 */

  canvasHost: HTMLElement;  
  /**
 * zoomSlider：zoomSlider相关字段。
 */

  zoomSlider: HTMLInputElement | null;  
  /**
 * zoomLevelEl：zoom等级El相关字段。
 */

  zoomLevelEl: HTMLElement | null;  
  /**
 * tickRateEl：tickRateEl相关字段。
 */

  tickRateEl: HTMLElement | null;  
  /**
 * currentTimeEl：current时间El相关字段。
 */

  currentTimeEl: HTMLElement | null;  
  /**
 * currentTimePhaseEl：current时间PhaseEl相关字段。
 */

  currentTimePhaseEl: HTMLElement | null;  
  /**
 * currentTimeHourAEl：current时间HourAEl相关字段。
 */

  currentTimeHourAEl: HTMLElement | null;  
  /**
 * currentTimeHourBEl：current时间HourBEl相关字段。
 */

  currentTimeHourBEl: HTMLElement | null;  
  /**
 * currentTimeDotEl：current时间DotEl相关字段。
 */

  currentTimeDotEl: HTMLElement | null;  
  /**
 * currentTimeMinAEl：current时间MinAEl相关字段。
 */

  currentTimeMinAEl: HTMLElement | null;  
  /**
 * currentTimeMinBEl：current时间MinBEl相关字段。
 */

  currentTimeMinBEl: HTMLElement | null;  
  /**
 * tickRateIntEl：tickRateIntEl相关字段。
 */

  tickRateIntEl: HTMLElement | null;  
  /**
 * tickRateDotEl：tickRateDotEl相关字段。
 */

  tickRateDotEl: HTMLElement | null;  
  /**
 * tickRateFracAEl：tickRateFracAEl相关字段。
 */

  tickRateFracAEl: HTMLElement | null;  
  /**
 * tickRateFracBEl：tickRateFracBEl相关字段。
 */

  tickRateFracBEl: HTMLElement | null;  
  /**
 * fpsRateEl：fpRateEl相关字段。
 */

  fpsRateEl: HTMLElement | null;  
  /**
 * fpsValueEl：fp值El相关字段。
 */

  fpsValueEl: HTMLElement | null;  
  /**
 * fpsLowValueEl：fpLow值El相关字段。
 */

  fpsLowValueEl: HTMLElement | null;  
  /**
 * fpsOnePercentValueEl：fpOnePercent值El相关字段。
 */

  fpsOnePercentValueEl: HTMLElement | null;  
  /**
 * pingLatencyEl：pingLatencyEl相关字段。
 */

  pingLatencyEl: HTMLElement | null;  
  /**
 * pingUnitEl：pingUnitEl相关字段。
 */

  pingUnitEl: HTMLElement | null;  
  /**
 * pingHundredsEl：pingHundredEl相关字段。
 */

  pingHundredsEl: HTMLElement | null;  
  /**
 * pingTensEl：pingTenEl相关字段。
 */

  pingTensEl: HTMLElement | null;  
  /**
 * pingOnesEl：pingOneEl相关字段。
 */

  pingOnesEl: HTMLElement | null;  
  /**
 * joinQqGroupBtns：joinQqGroupBtn相关字段。
 */

  joinQqGroupBtns: NodeListOf<HTMLAnchorElement>;  
  /**
 * targetingBadgeEl：targetingBadgeEl相关字段。
 */

  targetingBadgeEl: HTMLElement | null;  
  /**
 * observeModalEl：observe弹层El相关字段。
 */

  observeModalEl: HTMLElement | null;  
  /**
 * observeModalBodyEl：observe弹层BodyEl相关字段。
 */

  observeModalBodyEl: HTMLElement | null;  
  /**
 * observeModalSubtitleEl：observe弹层SubtitleEl相关字段。
 */

  observeModalSubtitleEl: HTMLElement | null;  
  /**
 * observeModalShellEl：observe弹层ShellEl相关字段。
 */

  observeModalShellEl: HTMLElement | null;  
  /**
 * observeModalAsideEl：observe弹层AsideEl相关字段。
 */

  observeModalAsideEl: HTMLElement | null;
};

export const QQ_GROUP_NUMBER = '940886387';
export const QQ_GROUP_MOBILE_DEEP_LINK = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP_NUMBER}&card_type=group&source=qrcode`;
export const QQ_GROUP_DESKTOP_DEEP_LINK = `tencent://AddContact/?fromId=45&fromSubId=1&subcmd=all&uin=${QQ_GROUP_NUMBER}`;
/**
 * collectMainDomElements：执行MainDomElement相关逻辑。
 * @param documentRef Document 参数说明。
 * @returns 返回MainDomElement。
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
