/**
 * 邮件 UI 与模板静态定义。
 * 说明：
 * - 邮件正文模板属于静态内容，不进入高频实时协议。
 * - 前后端共用同一份模板定义，服务端可据此生成列表摘要，客户端本地渲染详情正文。
 */

export const MAIL_PAGE_SIZE_DEFAULT = 12;
/** MAIL_PAGE_SIZE_MAX：定义该变量以承载业务值。 */
export const MAIL_PAGE_SIZE_MAX = 50;
/** MAIL_BATCH_OPERATION_MAX：定义该变量以承载业务值。 */
export const MAIL_BATCH_OPERATION_MAX = 20;

