import type { ChangeEvent } from 'react';
/**
 * UiSliderFieldProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiSliderFieldProps {
/**
 * label：UiSliderFieldProps 内部字段。
 */

  label: string;  
  /**
 * value：UiSliderFieldProps 内部字段。
 */

  value: number;  
  /**
 * min：UiSliderFieldProps 内部字段。
 */

  min: number;  
  /**
 * max：UiSliderFieldProps 内部字段。
 */

  max: number;  
  /**
 * step：UiSliderFieldProps 内部字段。
 */

  step?: number;  
  /**
 * valueText：UiSliderFieldProps 内部字段。
 */

  valueText?: string;  
  /**
 * onChange：UiSliderFieldProps 内部字段。
 */

  onChange: (value: number) => void;
}
/**
 * UiSliderField：执行核心业务逻辑。
 * @param {
  label,
  value,
  min,
  max,
  step = 1,
  valueText,
  onChange,
} UiSliderFieldProps 参数说明。
 * @returns 函数返回值。
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
