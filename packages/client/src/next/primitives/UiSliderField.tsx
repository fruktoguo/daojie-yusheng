import type { ChangeEvent } from 'react';

export interface UiSliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  valueText?: string;
  onChange: (value: number) => void;
}

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
