/**
 * UiResourceBarProps：定义接口结构约束，明确可交付字段含义。
 */
export interface UiResourceBarProps {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * max：max相关字段。
 */

  max: number;  
  /**
 * tone：tone相关字段。
 */

  tone?: 'health' | 'qi' | 'cultivate';  
  /**
 * variant：variant相关字段。
 */

  variant?: 'resource' | 'progress';  
  /**
 * valueText：值Text名称或显示文本。
 */

  valueText?: string;  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * ratioPercent：执行ratioPercent相关逻辑。
 * @param current number 参数说明。
 * @param max number 参数说明。
 * @returns 返回ratioPercent。
 */


function ratioPercent(current: number, max: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (max <= 0) {
    return '0%';
  }
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}
/**
 * UiResourceBar：渲染UiResourceBar组件。
 * @param {
  label,
  value,
  max,
  tone = 'health',
  variant = 'resource',
  valueText,
  className,
} UiResourceBarProps 参数说明。
 * @returns 无返回值，直接更新UiResourceBar相关状态。
 */


export function UiResourceBar({
  label,
  value,
  max,
  tone = 'health',
  variant = 'resource',
  valueText,
  className,
}: UiResourceBarProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['react-ui-resource-bar'];
  if (className) {
    classes.push(className);
  }

  const resolvedValueText = valueText ?? `${value} / ${max}`;

  return (
    <div className={classes.join(' ')}>
      <div className="react-ui-resource-head">
        <span className="react-ui-resource-label">{label}</span>
        <span className="react-ui-resource-text">{resolvedValueText}</span>
      </div>
      {variant === 'progress' ? (
        <div className="react-ui-progress-track">
          <div
            className={`react-ui-progress-fill react-ui-progress-fill--${tone}`}
            style={{ width: ratioPercent(value, max) }}
          />
        </div>
      ) : (
        <div className={`react-ui-resource-meter react-ui-resource-meter--${tone}`}>
          <div
            className={`react-ui-resource-fill react-ui-resource-fill--${tone}`}
            style={{ width: ratioPercent(value, max) }}
          />
        </div>
      )}
    </div>
  );
}
