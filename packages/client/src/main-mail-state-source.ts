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
 * socket：socket相关字段。
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
 * @returns 无返回值，直接更新Main邮件状态来源相关状态。
 */


export function createMainMailStateSource(options: MainMailStateSourceOptions) {
  const mailPanel = new MailPanel(options.socket);

  return {  
  /**
 * initFromPlayer：执行initFrom玩家相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新initFrom玩家相关状态。
 */

    initFromPlayer(playerId: string): void {
      mailPanel.setPlayerId(playerId);
    },    
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      mailPanel.clear();
    },    
    /**
 * handleMailSummary：处理邮件摘要并更新相关状态。
 * @param summary MailSummaryState 参数说明。
 * @returns 无返回值，直接更新邮件摘要相关状态。
 */


    handleMailSummary(summary: MailSummaryState): void {
      mailPanel.updateSummary(summary);
    },    
    /**
 * handleMailPage：处理邮件Page并更新相关状态。
 * @param page MailPageState 参数说明。
 * @returns 无返回值，直接更新邮件Page相关状态。
 */


    handleMailPage(page: MailPageState): void {
      mailPanel.updatePage(page);
    },    
    /**
 * handleMailDetail：处理邮件详情并更新相关状态。
 * @param detail MailDetailState 参数说明。
 * @param error MailDetailError 参数说明。
 * @returns 无返回值，直接更新邮件详情相关状态。
 */


    handleMailDetail(detail: MailDetailState, error?: MailDetailError): void {
      mailPanel.updateDetail(detail, error);
    },    
    /**
 * handleMailOpResult：处理邮件Op结果并更新相关状态。
 * @param result MailOpResultState 返回结果。
 * @returns 无返回值，直接更新邮件Op结果相关状态。
 */


    handleMailOpResult(result: MailOpResultState): void {
      mailPanel.handleOpResult(result);
    },
  };
}
