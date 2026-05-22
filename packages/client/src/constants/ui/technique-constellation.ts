/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 功法星图的星位命名常量。
 */
import { t } from '../../ui/i18n';

/** 星图节点的默认命名池。 */
export const TECHNIQUE_CONSTELLATION_NODE_NAMES = [
  t('technique.constellation.node.0', undefined),
  t('technique.constellation.node.1', undefined),
  t('technique.constellation.node.2', undefined),
  t('technique.constellation.node.3', undefined),
  t('technique.constellation.node.4', undefined),
  t('technique.constellation.node.5', undefined),
  t('technique.constellation.node.6', undefined),
  t('technique.constellation.node.7', undefined),
  t('technique.constellation.node.8', undefined),
  t('technique.constellation.node.9', undefined),
  t('technique.constellation.node.10', undefined),
  t('technique.constellation.node.11', undefined),
  t('technique.constellation.node.12', undefined),
  t('technique.constellation.node.13', undefined),
  t('technique.constellation.node.14', undefined),
  t('technique.constellation.node.15', undefined),
] as const;
