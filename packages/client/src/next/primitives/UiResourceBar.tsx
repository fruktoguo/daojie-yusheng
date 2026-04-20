/**
 * UiResourceBarProps：定义接口结构约束，明确可交付字段含义。
 */
export interface UiResourceBarProps {
/**
 * label：UiResourceBarProps 内部字段。
 */

  label: string;  
  /**
 * value：UiResourceBarProps 内部字段。
 */

  value: number;  
  /**
 * max：UiResourceBarProps 内部字段。
 */

  max: number;  
  /**
 * tone：UiResourceBarProps 内部字段。
 */

  tone?: 'health' | 'qi' | 'cultivate';  
  /**
 * variant：UiResourceBarProps 内部字段。
 */

  variant?: 'resource' | 'progress';  
  /**
 * valueText：UiResourceBarProps 内部字段。
 */

  valueText?: string;  
  /**
 * className：UiResourceBarProps 内部字段。
 */

  className?: string;
}
/**
 * ratioPercent：执行核心业务逻辑。
 * @param current number 参数说明。
 * @param max number 参数说明。
 * @returns string。
 */


function ratioPercent(current: number, max: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (max <= 0) {
    return '0%';
  }
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}
/**
 * UiResourceBar：执行核心业务逻辑。
 * @param {
  label,
  value,
  max,
  tone = 'health',
  variant = 'resource',
  valueText,
  className,
} UiResourceBarProps 参数说明。
 * @returns 函数返回值。
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

  const classes = ['next-ui-resource-bar'];
  if (className) {
    classes.push(className);
  }

  const resolvedValueText = valueText ?? `${value} / ${max}`;

  return (
    <div className={classes.join(' ')}>
      <div className="next-ui-resource-head">
        <span className="next-ui-resource-label">{label}</span>
        <span className="next-ui-resource-text">{resolvedValueText}</span>
      </div>
      {variant === 'progress' ? (
        <div className="next-ui-progress-track">
          <div
            className={`next-ui-progress-fill next-ui-progress-fill--${tone}`}
            style={{ width: ratioPercent(value, max) }}
          />
        </div>
      ) : (
        <div className={`next-ui-resource-meter next-ui-resource-meter--${tone}`}>
          <div
            className={`next-ui-resource-fill next-ui-resource-fill--${tone}`}
            style={{ width: ratioPercent(value, max) }}
          />
        </div>
      )}
    </div>
  );
}
