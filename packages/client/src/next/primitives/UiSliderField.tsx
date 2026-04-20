import type { ChangeEvent } from 'react';
/**
 * UiSliderFieldProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiSliderFieldProps {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * min：min相关字段。
 */

  min: number;  
  /**
 * max：max相关字段。
 */

  max: number;  
  /**
 * step：step相关字段。
 */

  step?: number;  
  /**
 * valueText：值Text名称或显示文本。
 */

  valueText?: string;  
  /**
 * onChange：onChange相关字段。
 */

  onChange: (value: number) => void;
}
/**
 * UiSliderField：判断UiSliderField是否满足条件。
 * @param {
  label,
  value,
  min,
  max,
  step = 1,
  valueText,
  onChange,
} UiSliderFieldProps 参数说明。
 * @returns 无返回值，直接更新UiSliderField相关状态。
 */


export function UiSliderField({
  label,
  value,
  min,
  max,
  step = 1,
  valueText,
  onChange,
}: UiSliderFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <label className="next-ui-form-field next-ui-slider-field">
      <span className="next-ui-slider-field-head">
        <span className="next-ui-form-label next-ui-slider-field-label">{label}</span>
        <span className="next-ui-slider-field-value">{valueText ?? String(value)}</span>
      </span>
      <input
        className="next-ui-slider-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
      />
    </label>
  );
}
