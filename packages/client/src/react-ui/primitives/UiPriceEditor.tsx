import { UiButton } from './UiButton';
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
 * UiPriceEditorProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiPriceEditorProps {
/**
 * label：label名称或显示文本。
 */

  label?: string;  
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
 * presets：preset相关字段。
 */

  presets?: number[];  
  /**
 * onChange：onChange相关字段。
 */

  onChange: (value: number) => void;
}
/**
 * UiPriceEditor：渲染Ui价格Editor组件。
 * @param {
  label = '价格',
  value,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  presets = [],
  onChange,
} UiPriceEditorProps 参数说明。
 * @returns 无返回值，直接更新Ui价格Editor相关状态。
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
    <div className="react-ui-price-editor">
      <div className="react-ui-price-editor-head">
        <span className="react-ui-price-editor-label">{label}</span>
        <span className="react-ui-price-editor-value">{value}</span>
      </div>
      {presets.length > 0 ? (
        <div className="react-ui-price-editor-presets">
          {presets.map((preset) => (
            <UiButton key={preset} type="button" variants={['ghost']} onClick={() => updateValue(preset)}>
              {preset}
            </UiButton>
          ))}
        </div>
      ) : null}
      <div className="react-ui-inline-meta-row react-ui-price-editor-controls">
        <UiButton type="button" variants={['ghost']} onClick={() => updateValue(value - step)} disabled={value <= min}>-</UiButton>
        <input
          className="react-ui-input react-ui-price-editor-input"
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
