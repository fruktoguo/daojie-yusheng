import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { MailPanel } from './ui/mail-panel';

type MailSummaryState = Parameters<MailPanel['updateSummary']>[0];
type MailPageState = Parameters<MailPanel['updatePage']>[0];
type MailDetailState = Parameters<MailPanel['updateDetail']>[0];
type MailDetailError = Parameters<MailPanel['updateDetail']>[1];
type MailOpResultState = Parameters<MailPanel['handleOpResult']>[0];

type MainMailStateSourceOptions = {
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

export type MainMailStateSource = ReturnType<typeof createMainMailStateSource>;

export function createMainMailStateSource(options: MainMailStateSourceOptions) {
  const mailPanel = new MailPanel(options.socket);

  return {
    initFromPlayer(playerId: string): void {
      mailPanel.setPlayerId(playerId);
    },

    clear(): void {
      mailPanel.clear();
    },

    handleMailSummary(summary: MailSummaryState): void {
      mailPanel.updateSummary(summary);
    },

    handleMailPage(page: MailPageState): void {
      mailPanel.updatePage(page);
    },

    handleMailDetail(detail: MailDetailState, error?: MailDetailError): void {
      mailPanel.updateDetail(detail, error);
    },

    handleMailOpResult(result: MailOpResultState): void {
      mailPanel.handleOpResult(result);
    },
  };
}
