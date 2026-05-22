/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
import { TUTORIAL_MECHANIC_TOPICS as SHARED_TUTORIAL_MECHANIC_TOPICS } from '@mud/shared';

/** TutorialTopicSection：教程章节分段。 */
export interface TutorialTopicSection {
  title: string;
  items: string[];
}

/** TutorialTopic：基础教程章节条目。 */
export interface TutorialTopic {
  id: string;
  label: string;
  summary: string;
  sections: TutorialTopicSection[];
  tips?: string[];
}

/** TutorialFlowTopic：流程型教程章节条目。 */
export interface TutorialFlowTopic {
  id: string;
  label: string;
  summary: string;
  sections: TutorialTopicSection[];
  tips?: string[];
}

export const TUTORIAL_TOPICS: TutorialTopic[] = [];

export const TUTORIAL_MECHANIC_TOPICS: TutorialTopic[] = SHARED_TUTORIAL_MECHANIC_TOPICS;

export const TUTORIAL_FLOW_TOPICS: TutorialFlowTopic[] = [];
