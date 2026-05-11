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
