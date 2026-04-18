import { UiButton } from './UiButton';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface UiPriceEditorProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  presets?: number[];
  onChange: (value: number) => void;
}

export function UiPriceEditor({
  label = '价格',
  value,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  presets = [],
  onChange,
}: UiPriceEditorProps) {
  const updateValue = (next: number) => {
    onChange(clamp(Math.floor(next), min, max));
  };

  return (
    <div className="next-ui-price-editor">
      <div className="next-ui-price-editor-head">
        <span className="next-ui-price-editor-label">{label}</span>
        <span className="next-ui-price-editor-value">{value}</span>
      </div>
      {presets.length > 0 ? (
        <div className="next-ui-price-editor-presets">
          {presets.map((preset) => (
            <UiButton key={preset} type="button" variants={['ghost']} onClick={() => updateValue(preset)}>
              {preset}
            </UiButton>
          ))}
        </div>
      ) : null}
      <div className="next-ui-inline-meta-row next-ui-price-editor-controls">
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(value - step)} disabled={value <= min}>-</UiButton>
        <input
          className="next-ui-input next-ui-price-editor-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => updateValue(Number(event.target.value))}
        />
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(value + step)} disabled={value >= max}>+</UiButton>
      </div>
    </div>
  );
}
