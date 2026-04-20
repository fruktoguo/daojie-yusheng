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
 * UiPriceEditorProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiPriceEditorProps {
/**
 * label：UiPriceEditorProps 内部字段。
 */

  label?: string;  
  /**
 * value：UiPriceEditorProps 内部字段。
 */

  value: number;  
  /**
 * min：UiPriceEditorProps 内部字段。
 */

  min?: number;  
  /**
 * max：UiPriceEditorProps 内部字段。
 */

  max?: number;  
  /**
 * step：UiPriceEditorProps 内部字段。
 */

  step?: number;  
  /**
 * presets：UiPriceEditorProps 内部字段。
 */

  presets?: number[];  
  /**
 * onChange：UiPriceEditorProps 内部字段。
 */

  onChange: (value: number) => void;
}
/**
 * UiPriceEditor：执行核心业务逻辑。
 * @param {
  label = '价格',
  value,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  presets = [],
  onChange,
} UiPriceEditorProps 参数说明。
 * @returns 函数返回值。
 */


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
