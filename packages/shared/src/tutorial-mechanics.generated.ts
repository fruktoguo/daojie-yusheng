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
