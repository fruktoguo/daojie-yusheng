export interface UiResourceBarProps {
  label: string;
  value: number;
  max: number;
  tone?: 'health' | 'qi' | 'cultivate';
  variant?: 'resource' | 'progress';
  valueText?: string;
  className?: string;
}

function ratioPercent(current: number, max: number): string {
  if (max <= 0) {
    return '0%';
  }
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}

export function UiResourceBar({
  label,
  value,
  max,
  tone = 'health',
  variant = 'resource',
  valueText,
  className,
}: UiResourceBarProps) {
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
