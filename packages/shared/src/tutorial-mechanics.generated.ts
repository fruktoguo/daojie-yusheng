/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 由 scripts/sync-tutorial-mechanics.mjs 从 docs/tutorial-mechanics.md 自动生成。
 * 不要手改此文件。
 */

export interface SharedTutorialTopicSection {
  title: string;
  items: string[];
}

export interface SharedTutorialTopic {
  id: string;
  label: string;
  summary: string;
  sections: SharedTutorialTopicSection[];
  tips?: string[];
}

export const TUTORIAL_MECHANIC_TOPICS: SharedTutorialTopic[] = [];
