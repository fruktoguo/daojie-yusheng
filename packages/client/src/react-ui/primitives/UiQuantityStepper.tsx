/**
 * 本文件提供 React UI 的 UiQuantityStepper 基础组件，用于复用面板内的视觉和交互片段。
 *
 * 维护时应保持组件无业务真源，只通过 props 呈现状态，并兼顾浅色、深色与移动端可用性。
 */
import type { ChangeEvent } from 'react';

import { UiButton } from './UiButton';
import { t } from '../../ui/i18n';
/**
 * clamp：执行clamp相关逻辑。
 * @param value number 参数说明。
 * @param min number 参数说明。
 * @param max number 参数说明。
 * @returns 返回clamp。
 */


function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
/**
 * UiQuantityStepperProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiQuantityStepperProps {
/**
 * value：值数值。
 */

  value: number;  
  /**
 * min：min相关字段。
 */

  min?: number;  
  /**
 * max：max相关字段。
 */

  max?: number;  
  /**
 * step：step相关字段。
 */

  step?: number;  
  /**
 * label：label名称或显示文本。
 */

  label?: string;  
  /**
 * onChange：onChange相关字段。
 */

  onChange: (value: number) => void;
}
/**
 * UiQuantityStepper：渲染UiQuantityStepper组件。
 * @param {
  value,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label = '数量',
  onChange,
} UiQuantityStepperProps 参数说明。
 * @returns 无返回值，直接更新UiQuantityStepper相关状态。
 */


export function UiQuantityStepper({
  value,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label = t('react.stepper.quantity', undefined),
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
    <div className="react-ui-stepper">
      <span className="react-ui-stepper-label">{label}</span>
      <div className="react-ui-inline-meta-row react-ui-stepper-controls">
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(min)} disabled={value <= min}>{t('react.stepper.min', undefined)}</UiButton>
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(value - step)} disabled={value <= min}>-</UiButton>
        <input
          className="react-ui-input react-ui-stepper-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleInput}
        />
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(value + step)} disabled={value >= max}>+</UiButton>
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(max)} disabled={value >= max}>{t('react.stepper.max', undefined)}</UiButton>
      </div>
    </div>
  );
}
