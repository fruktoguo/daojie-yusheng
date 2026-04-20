import type { ChangeEvent } from 'react';

import { UiButton } from './UiButton';
/**
 * clamp：执行核心业务逻辑。
 * @param value number 参数说明。
 * @param min number 参数说明。
 * @param max number 参数说明。
 * @returns number。
 */


function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
/**
 * UiQuantityStepperProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiQuantityStepperProps {
/**
 * value：UiQuantityStepperProps 内部字段。
 */

  value: number;  
  /**
 * min：UiQuantityStepperProps 内部字段。
 */

  min?: number;  
  /**
 * max：UiQuantityStepperProps 内部字段。
 */

  max?: number;  
  /**
 * step：UiQuantityStepperProps 内部字段。
 */

  step?: number;  
  /**
 * label：UiQuantityStepperProps 内部字段。
 */

  label?: string;  
  /**
 * onChange：UiQuantityStepperProps 内部字段。
 */

  onChange: (value: number) => void;
}
/**
 * UiQuantityStepper：执行核心业务逻辑。
 * @param {
  value,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label = '数量',
  onChange,
} UiQuantityStepperProps 参数说明。
 * @returns 函数返回值。
 */


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
