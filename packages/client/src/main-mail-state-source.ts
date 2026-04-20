import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { MailPanel } from './ui/mail-panel';
/**
 * MailSummaryState：统一结构类型，保证协议与运行时一致性。
 */


type MailSummaryState = Parameters<MailPanel['updateSummary']>[0];
/**
 * MailPageState：统一结构类型，保证协议与运行时一致性。
 */

type MailPageState = Parameters<MailPanel['updatePage']>[0];
/**
 * MailDetailState：统一结构类型，保证协议与运行时一致性。
 */

type MailDetailState = Parameters<MailPanel['updateDetail']>[0];
/**
 * MailDetailError：统一结构类型，保证协议与运行时一致性。
 */

type MailDetailError = Parameters<MailPanel['updateDetail']>[1];
/**
 * MailOpResultState：统一结构类型，保证协议与运行时一致性。
 */

type MailOpResultState = Parameters<MailPanel['handleOpResult']>[0];
/**
 * MainMailStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainMailStateSourceOptions = {
/**
 * socket：对象字段。
 */

  socket: Pick<
    SocketSocialEconomySender,
    | 'sendRequestMailSummary'
    | 'sendRequestMailPage'
    | 'sendRequestMailDetail'
    | 'sendMarkMailRead'
    | 'sendClaimMailAttachments'
    | 'sendDeleteMail'
  >;
};
/**
 * MainMailStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainMailStateSource = ReturnType<typeof createMainMailStateSource>;
/**
 * createMainMailStateSource：构建并返回目标对象。
 * @param options MainMailStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainMailStateSource(options: MainMailStateSourceOptions) {
  const mailPanel = new MailPanel(options.socket);

  return {  
  /**
 * initFromPlayer：初始化并准备运行时基础状态。
 * @param playerId string 玩家 ID。
 * @returns void。
 */

    initFromPlayer(playerId: string): void {
      mailPanel.setPlayerId(playerId);
    },    
    /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */


    clear(): void {
      mailPanel.clear();
    },    
    /**
 * handleMailSummary：处理事件并驱动执行路径。
 * @param summary MailSummaryState 参数说明。
 * @returns void。
 */


    handleMailSummary(summary: MailSummaryState): void {
      mailPanel.updateSummary(summary);
    },    
    /**
 * handleMailPage：处理事件并驱动执行路径。
 * @param page MailPageState 参数说明。
 * @returns void。
 */


    handleMailPage(page: MailPageState): void {
      mailPanel.updatePage(page);
    },    
    /**
 * handleMailDetail：处理事件并驱动执行路径。
 * @param detail MailDetailState 参数说明。
 * @param error MailDetailError 参数说明。
 * @returns void。
 */


    handleMailDetail(detail: MailDetailState, error?: MailDetailError): void {
      mailPanel.updateDetail(detail, error);
    },    
    /**
 * handleMailOpResult：处理事件并驱动执行路径。
 * @param result MailOpResultState 返回结果。
 * @returns void。
 */


    handleMailOpResult(result: MailOpResultState): void {
      mailPanel.handleOpResult(result);
    },
  };
}
