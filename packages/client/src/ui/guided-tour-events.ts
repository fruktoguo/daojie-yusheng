/**
 * 客户端导览事件：用于让任务面板等 UI 入口请求播放指定引导组。
 *
 * 这里只传递前端显示意图，不参与服务端任务进度或玩家资产判定。
 */

export const GUIDED_TOUR_START_EVENT = 'mud:guided-tour:start';

export interface GuidedTourStartEventDetail {
  flowId: string;
}

export function requestGuidedTour(flowId: string, windowRef: Window = window): void {
  const normalizedFlowId = flowId.trim();
  if (!normalizedFlowId) {
    return;
  }
  windowRef.dispatchEvent(new CustomEvent<GuidedTourStartEventDetail>(GUIDED_TOUR_START_EVENT, {
    detail: { flowId: normalizedFlowId },
  }));
}
