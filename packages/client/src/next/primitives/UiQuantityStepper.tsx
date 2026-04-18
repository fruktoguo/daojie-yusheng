import type { ChangeEvent } from 'react';

import { UiButton } from './UiButton';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface UiQuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  onChange: (value: number) => void;
}

export function UiQuantityStepper({
  value,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label = '数量',
  onChange,
}: UiQuantityStepperProps) {
  const updateValue = (next: number) => {
    onChange(clamp(next, min, max));
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isFinite(parsed)) {
      updateValue(parsed);
    }
  };

  return (
    <div className="next-ui-stepper">
      <span className="next-ui-stepper-label">{label}</span>
      <div className="next-ui-inline-meta-row next-ui-stepper-controls">
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(min)} disabled={value <= min}>最小</UiButton>
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(value - step)} disabled={value <= min}>-</UiButton>
        <input
          className="next-ui-input next-ui-stepper-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleInput}
        />
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(value + step)} disabled={value >= max}>+</UiButton>
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(max)} disabled={value >= max}>最大</UiButton>
      </div>
    </div>
  );
}
