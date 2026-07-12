/**
 * 背包阵法布置对话框。
 *
 * 只负责表单、预览和载荷组装；资源扣除、放置合法性及最终数值仍由服务端权威校验。
 */
import {
  BUILTIN_FORMATION_TEMPLATES,
  FORMATION_SPIRIT_STONE_ITEM_ID,
  FORMATION_TICKS_PER_DAY,
  normalizeFormationSetup,
  percentModifierToMultiplier,
  resolveFormationCostConfig,
  resolveFormationDamagePerAura,
  resolveFormationDamageReduction,
  resolveFormationSetupPlan,
  resolveFormationVisual,
  type FormationCreatePayload,
  type FormationEffectKind,
  type FormationResolvedStats,
  type FormationSetup,
  type FormationTemplate,
  type Inventory,
  type ItemStack,
  type FormationRangeShape,
} from '@mud/shared';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { t } from '../i18n';

const FORMATION_SETUP_MIN_RADIUS = 1;
const FORMATION_SETUP_MAX_RADIUS = 10;
const FORMATION_SETUP_MIN_DURATION_MINUTES = 1;
const FORMATION_SETUP_MAX_DURATION_MINUTES = 24 * 60;

export type FormationRangePreviewPayload = {
  shape: FormationRangeShape;
  radius: number;
  rangeHighlightColor?: string;
} | null;

export interface InventoryFormationDialogOptions {
  getInventory(): Inventory | null;
  getPlayerQi(): number;
  getFormationSkillLevel(): number;
  resolveDiskMultiplier(item: ItemStack): number;
  getItemInstanceId(item: ItemStack | null | undefined): string;
  repairMissingItemInstanceIds(): void;
  previewRange(payload: FormationRangePreviewPayload): void;
}

type FormationEffectDescription = {
  kindLabel: string;
  fallbackDesc: string;
  target: string;
  scaling: string;
  visibility: string;
};

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class InventoryFormationDialogController {
  constructor(private readonly options: InventoryFormationDialogOptions) {}

  renderBody(body: HTMLElement, item: ItemStack): void {
    const diskMultiplier = this.options.resolveDiskMultiplier(item);
    replaceElementHtml(body, `
      <div class="formation-dialog-layout">
      <div class="formation-config-grid">
        <label class="formation-config-field formation-config-field--select ui-detail-field">
          <strong>${t('inventory.formation.field.template', undefined)}</strong>
          <select class="ui-input formation-config-input" data-formation-input data-formation-id>
            ${BUILTIN_FORMATION_TEMPLATES.filter((template) => template.placeableByDisk !== false).map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`).join('')}
          </select>
        </label>
        <label class="formation-config-field formation-config-field--slider ui-detail-field">
          <strong>${t('inventory.formation.field.range', undefined)} <span>${t('inventory.formation.default-radius', undefined)} <output data-formation-default-radius>1</output> ${t('common.unit.grid', undefined)}</span></strong>
          <div class="formation-config-slider-row">
            <input class="formation-config-slider" data-formation-input data-formation-radius-slider type="range" min="${FORMATION_SETUP_MIN_RADIUS}" max="${FORMATION_SETUP_MAX_RADIUS}" step="1" value="1">
            <input class="ui-input formation-config-input formation-config-number-input" data-formation-input data-formation-radius-input type="number" min="${FORMATION_SETUP_MIN_RADIUS}" max="${FORMATION_SETUP_MAX_RADIUS}" step="1" value="1">
          </div>
        </label>
        <label class="formation-config-field formation-config-field--slider ui-detail-field">
          <strong>${t('inventory.formation.field.duration', undefined)} <span>${t('inventory.formation.default-duration', undefined)} <output data-formation-default-duration>1440 ${t('common.unit.minute', undefined)}</output></span></strong>
          <div class="formation-config-slider-row">
            <input class="formation-config-slider" data-formation-input data-formation-duration-slider type="range" min="${FORMATION_SETUP_MIN_DURATION_MINUTES}" max="${FORMATION_SETUP_MAX_DURATION_MINUTES}" step="1" value="1440">
            <input class="ui-input formation-config-input formation-config-number-input" data-formation-input data-formation-duration-input type="number" min="${FORMATION_SETUP_MIN_DURATION_MINUTES}" max="${FORMATION_SETUP_MAX_DURATION_MINUTES}" step="1" value="1440">
          </div>
        </label>
        <label class="formation-config-field ui-detail-field">
          <strong>${t('inventory.formation.field.effect', undefined)} <span>${t('inventory.formation.min-effect', undefined)} <output data-formation-min-effect>1</output></span></strong>
          <input class="ui-input formation-config-input" data-formation-input data-formation-effect-value type="number" min="1" step="1" value="1">
        </label>
        <div class="formation-cost-card ui-detail-field" data-formation-stone-state>
          <strong>${t('inventory.formation.cost.spirit-stone', undefined)}</strong>
          <output data-formation-stone-cost>-</output>
          <span>${t('inventory.formation.cost.reverse-note', undefined)}</span>
        </div>
        <div class="formation-cost-card ui-detail-field" data-formation-cost-state>
          <strong>${t('inventory.formation.cost.qi', undefined)}</strong>
          <output data-formation-qi-cost>-</output>
          <span>${t('inventory.formation.current', undefined)} <output data-formation-current-qi>${formatDisplayInteger(this.options.getPlayerQi())}</output></span>
        </div>
      </div>
      <div class="formation-preview">
        <div class="formation-section-heading">
          <strong>${t('inventory.formation.preview.common', undefined)}</strong>
          <span data-formation-preview-summary>${t('inventory.formation.disk-multiplier', { multiplier: formatDisplayNumber(diskMultiplier) })}</span>
        </div>
        <div class="formation-preview-metrics">
          <span><em>${t('inventory.formation.stat.total-aura', undefined)}</em><output data-formation-stat="totalAura">-</output></span>
          <span><em>${t('inventory.formation.stat.total-stones', undefined)}</em><output data-formation-stat="totalStones">-</output></span>
          <span><em>${t('inventory.formation.stat.effect', undefined)}</em><output data-formation-stat="effectValue">-</output></span>
          <span><em>${t('inventory.formation.stat.radius', undefined)}</em><output data-formation-stat="radius">-</output></span>
          <span><em>${t('inventory.formation.stat.duration', undefined)}</em><output data-formation-stat="durationHours">-</output></span>
          <span class="formation-preview-metric--wide"><em>${t('inventory.formation.stat.active-cost', undefined)}</em><output data-formation-stat="activeCost">-</output></span>
          <span class="formation-preview-metric--wide"><em>${t('inventory.formation.stat.inactive-cost', undefined)}</em><output data-formation-stat="inactiveCost">-</output></span>
        </div>
      </div>
      <div class="formation-effect-card ui-detail-field">
        <div class="formation-section-heading">
          <strong>${t('inventory.formation.preview.unique', undefined)}</strong>
          <span data-formation-effect-kind>-</span>
        </div>
        <div class="formation-effect-specific-metrics" data-formation-effect-specific-metrics></div>
        <div class="formation-effect-desc" data-formation-effect-desc>-</div>
        <div class="formation-effect-list">
          <span><em>${t('inventory.formation.effect.target', undefined)}</em><output data-formation-effect-target>-</output></span>
          <span><em>${t('inventory.formation.effect.scaling', undefined)}</em><output data-formation-effect-scaling>-</output></span>
          <span><em>${t('inventory.formation.effect.range', undefined)}</em><output data-formation-effect-range>-</output></span>
          <span><em>${t('inventory.formation.effect.visibility', undefined)}</em><output data-formation-effect-visibility>-</output></span>
        </div>
      </div>
      <button class="small-btn ghost formation-range-preview-btn" type="button" data-formation-range-preview>${t('inventory.formation.action.preview-range', undefined)}</button>
      <div class="inventory-detail-actions">
        <div class="inventory-detail-actions-group inventory-detail-actions-group--right inventory-detail-actions-group--stretch">
          <button class="small-btn ghost" type="button" data-formation-cancel>${t('inventory.action.back-detail', undefined)}</button>
          <button class="small-btn" type="button" data-formation-confirm>${t('inventory.formation.action.confirm', undefined)}</button>
        </div>
      </div>
      </div>
    `);
  }

  bind(body: HTMLElement, item: ItemStack, signal: AbortSignal): void {
    body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-formation-input]').forEach((input) => {
      const onInput = () => {
        this.syncPairedInput(body, input);
        this.syncPreview(body, item);
      };
      input.addEventListener('input', onInput, { signal });
      input.addEventListener('change', onInput, { signal });
    });
    this.syncPreview(body, item);
    this.bindRangePreviewButton(body, signal);
  }

  readPayload(body: HTMLElement, item: ItemStack | null, enforceQi = true): FormationCreatePayload | null {
    const template = this.getSelectedTemplate(body);
    const itemInstanceId = this.options.getItemInstanceId(item);
    if (!itemInstanceId) {
      this.options.repairMissingItemInstanceIds();
      return null;
    }
    const diskMultiplier = item ? this.options.resolveDiskMultiplier(item) : 1;
    const setup = this.syncSetupInputs(body, template);
    const skillLevel = this.options.getFormationSkillLevel();
    const plan = resolveFormationSetupPlan(template, diskMultiplier, setup, skillLevel);
    if (enforceQi && this.options.getPlayerQi() < plan.qiCost) {
      return null;
    }
    if (this.getCurrentSpiritStoneCount() < plan.spiritStoneCount) {
      return null;
    }
    return {
      itemRef: { itemInstanceId },
      formationId: template.id,
      setup: plan.setup,
      spiritStoneCount: plan.spiritStoneCount,
      qiCost: plan.qiCost,
    };
  }

  clearWorldPreview(): void {
    document.getElementById('detail-modal')?.classList.remove('formation-range-preview-active');
    document.getElementById('detail-modal-card')?.classList.remove('formation-range-preview-active');
    this.options.previewRange(null);
  }

  private syncPreview(body: HTMLElement, item: ItemStack): void {
    const previewSummary = body.querySelector<HTMLElement>('[data-formation-preview-summary]');
    const template = this.getSelectedTemplate(body);
    const diskMultiplier = this.options.resolveDiskMultiplier(item);
    const setup = this.syncSetupInputs(body, template);
    const skillLevel = this.options.getFormationSkillLevel();
    const plan = resolveFormationSetupPlan(template, diskMultiplier, setup, skillLevel);
    const stats = plan.stats;
    const playerQi = this.options.getPlayerQi();
    const spiritStoneTotal = this.getCurrentSpiritStoneCount();
    const hasEnoughQi = playerQi >= plan.qiCost;
    const hasEnoughStones = spiritStoneTotal >= plan.spiritStoneCount;
    const costState = body.querySelector<HTMLElement>('[data-formation-cost-state]');
    const stoneState = body.querySelector<HTMLElement>('[data-formation-stone-state]');
    const stoneCostOutput = body.querySelector<HTMLOutputElement>('[data-formation-stone-cost]');
    if (stoneCostOutput) {
      stoneCostOutput.value = formatDisplayInteger(plan.spiritStoneCount);
      stoneCostOutput.textContent = formatDisplayInteger(plan.spiritStoneCount);
      stoneCostOutput.setAttribute('aria-label', `当前 ${formatDisplayInteger(spiritStoneTotal)}，需要 ${formatDisplayInteger(plan.spiritStoneCount)}`);
    }
    const qiCostOutput = body.querySelector<HTMLOutputElement>('[data-formation-qi-cost]');
    if (qiCostOutput) {
      qiCostOutput.value = formatDisplayInteger(plan.qiCost);
      qiCostOutput.textContent = formatDisplayInteger(plan.qiCost);
      qiCostOutput.setAttribute('aria-label', `当前 ${formatDisplayInteger(playerQi)}，需要 ${formatDisplayInteger(plan.qiCost)}`);
    }
    const currentQiOutput = body.querySelector<HTMLOutputElement>('[data-formation-current-qi]');
    if (currentQiOutput) {
      currentQiOutput.value = formatDisplayInteger(playerQi);
      currentQiOutput.textContent = formatDisplayInteger(playerQi);
    }
    if (costState) costState.dataset.formationCostState = hasEnoughQi ? 'ready' : 'insufficient';
    if (stoneState) stoneState.dataset.formationCostState = hasEnoughStones ? 'ready' : 'insufficient';
    if (previewSummary) {
      previewSummary.textContent = !hasEnoughStones
        ? `灵石不足 ${formatDisplayInteger(plan.spiritStoneCount - spiritStoneTotal)}`
        : hasEnoughQi
          ? `阵盘增幅 ${formatDisplayNumber(diskMultiplier)} 倍 · 阵法 ${formatDisplayNumber(skillLevel)} 级`
          : `灵力不足 ${formatDisplayInteger(plan.qiCost - playerQi)}`;
    }
    this.setStatText(body, 'totalAura', stats.totalQiBudget ?? stats.totalAuraBudget);
    this.setStatText(body, 'totalStones', stats.totalSpiritStoneBudget ?? plan.spiritStoneCount);
    this.setStatText(body, 'effectValue', stats.effectValue);
    this.setStatText(body, 'radius', stats.radius);
    this.setStatText(body, 'durationHours', stats.durationHours ?? setup.durationHours, 'duration');
    this.setStatText(body, 'activeCost', this.formatResourceCost(stats.dailyActiveQiCost ?? stats.dailyActiveCost, stats.dailyActiveSpiritStoneCost ?? 0));
    this.setStatText(body, 'inactiveCost', this.formatResourceCost(stats.dailyInactiveQiCost ?? stats.dailyInactiveCost, stats.dailyInactiveSpiritStoneCost ?? 0));
    this.syncEffectIntro(body, template, stats);
    const confirmButton = body.querySelector<HTMLButtonElement>('[data-formation-confirm]');
    if (confirmButton) {
      confirmButton.disabled = !hasEnoughQi || !hasEnoughStones;
      if (hasEnoughStones && hasEnoughQi) {
        confirmButton.removeAttribute('aria-label');
      } else {
        confirmButton.setAttribute('aria-label', !hasEnoughStones
          ? `灵石不足：当前 ${formatDisplayInteger(spiritStoneTotal)}，需要 ${formatDisplayInteger(plan.spiritStoneCount)}`
          : `灵力不足：当前 ${formatDisplayInteger(playerQi)}，需要 ${formatDisplayInteger(plan.qiCost)}`);
      }
      confirmButton.textContent = hasEnoughStones && hasEnoughQi ? '确认布阵' : !hasEnoughStones ? '灵石不足' : '灵力不足';
    }
    const previewButton = body.querySelector<HTMLButtonElement>('[data-formation-range-preview]');
    if (previewButton) {
      const shapeLabel = template.range.shape === 'circle' ? '圆形' : template.range.shape === 'square' ? '方形' : '棋盘';
      previewButton.textContent = `预览范围：${shapeLabel}半径 ${formatDisplayInteger(stats.radius)}`;
    }
    this.options.previewRange({
      shape: template.range.shape,
      radius: stats.radius,
      rangeHighlightColor: resolveFormationVisual(template).rangeHighlightColor,
    });
  }

  private syncEffectIntro(body: HTMLElement, template: FormationTemplate, stats: FormationResolvedStats): void {
    const meta = this.describeEffect(template.effect.kind, stats);
    this.setText(body, '[data-formation-effect-kind]', meta.kindLabel);
    this.renderSpecificPreview(body, template, stats);
    this.setText(body, '[data-formation-effect-desc]', template.desc?.trim() || meta.fallbackDesc);
    this.setText(body, '[data-formation-effect-target]', meta.target);
    this.setText(body, '[data-formation-effect-scaling]', meta.scaling);
    this.setText(body, '[data-formation-effect-range]', this.describeRange(template, stats));
    this.setText(body, '[data-formation-effect-visibility]', meta.visibility);
  }

  private renderSpecificPreview(body: HTMLElement, template: FormationTemplate, stats: FormationResolvedStats): void {
    const container = body.querySelector<HTMLElement>('[data-formation-effect-specific-metrics]');
    if (!container) return;
    container.replaceChildren(...this.describeSpecificMetrics(template, stats).map((metric) => {
      const item = document.createElement('span');
      const label = document.createElement('em');
      label.textContent = metric.label;
      const output = document.createElement('output');
      output.value = metric.value;
      output.textContent = metric.value;
      item.append(label, output);
      return item;
    }));
  }

  private describeSpecificMetrics(template: FormationTemplate, stats: FormationResolvedStats): Array<{ label: string; value: string }> {
    if (template.effect.kind === 'tile_aura_source') {
      const halfLifeTicks = Math.max(1, Math.trunc(template.effect.convergenceHalfLifeTicks ?? FORMATION_TICKS_PER_DAY));
      const perTickGain = stats.effectValue > 0 ? stats.effectValue / halfLifeTicks : 0;
      return [
        { label: '每息增加灵力', value: formatDisplayNumber(perTickGain, { maximumFractionDigits: 2, compactMaximumFractionDigits: 2 }) },
        { label: '预计最大灵力', value: formatDisplayInteger(stats.effectValue) },
      ];
    }
    if (template.effect.kind === 'terrain_stabilizer') {
      const reduction = resolveFormationDamageReduction(template, stats.effectValue);
      return [
        { label: '地块受击减伤', value: this.formatPercent(reduction) },
        { label: '实际承伤比例', value: this.formatPercent(1 - reduction) },
      ];
    }
    if (template.effect.kind === 'monster_suppression') {
      const layers = Math.max(0, Math.floor(stats.effectValue));
      return [
        { label: '压制层数', value: formatDisplayInteger(layers) },
        { label: '经验剩余比例', value: this.formatPercent(percentModifierToMultiplier(-layers)) },
      ];
    }
    if (template.effect.kind === 'vision_suppression') {
      const percentPerStrength = Number.isFinite(Number(template.effect.visionReductionPercentPerStrength))
        ? Math.max(0, Number(template.effect.visionReductionPercentPerStrength))
        : 10;
      const reductionPercent = Math.max(0, Math.floor(stats.effectValue) * percentPerStrength);
      return [
        { label: '视野削减', value: `${formatDisplayNumber(reductionPercent)}%` },
        { label: '视野剩余比例', value: this.formatPercent(percentModifierToMultiplier(-reductionPercent)) },
      ];
    }
    const reduction = resolveFormationDamageReduction(template, stats.effectValue);
    const rawDurability = Math.max(1, Math.ceil((stats.totalQiBudget ?? stats.totalAuraBudget) * resolveFormationDamagePerAura(template)));
    const effectiveDurability = Math.max(1, Math.ceil(rawDurability / Math.max(0.000001, 1 - reduction)));
    return [
      { label: '预计承受伤害', value: formatDisplayInteger(effectiveDurability) },
      { label: '阵法减伤', value: this.formatPercent(reduction) },
    ];
  }

  private describeEffect(kind: FormationEffectKind, stats: FormationResolvedStats): FormationEffectDescription {
    const effectValue = formatDisplayInteger(stats.effectValue);
    if (kind === 'tile_aura_source') {
      return {
        kindLabel: '灵气增幅',
        fallbackDesc: '持续抬升范围内地块灵气，使地块资源逐步接近目标灵气。',
        target: '范围内地块',
        scaling: `基础强度按阵盘与技艺增幅后，每 1 强度对应 100 灵气，当前目标 ${effectValue}`,
        visibility: '感气后可查看范围与阵眼',
      };
    }
    if (kind === 'terrain_stabilizer') {
      return {
        kindLabel: '地脉稳固',
        fallbackDesc: '稳固范围内地脉，抑制地块复生、消散与被拆损耗。',
        target: '可攻击地块与临时地块',
        scaling: `实际强度 ${effectValue}，每 10 强度约降低 1% 地块受击伤害`,
        visibility: '范围内自动生效',
      };
    }
    if (kind === 'monster_suppression') {
      return {
        kindLabel: '封魔压制',
        fallbackDesc: '压制范围内妖兽的主要战斗属性，并按实际压制幅度降低击杀经验。',
        target: '范围内妖兽',
        scaling: `实际强度 ${effectValue}，每 1 强度提供 1 层压制`,
        visibility: '范围内自动生效，多阵重叠取最高压制层数',
      };
    }
    if (kind === 'vision_suppression') {
      return {
        kindLabel: '视野压制',
        fallbackDesc: '遮蔽范围内修士感知，降低服务端视野半径。',
        target: '范围内玩家',
        scaling: `实际强度 ${effectValue}，每 1 强度提供 10% 视野削减`,
        visibility: '范围内自动生效，多阵重叠取最高视野削减',
      };
    }
    return {
      kindLabel: '边界封锁',
      fallbackDesc: '在阵法边界形成阻挡，封锁通行与视线。',
      target: '阵法边界与阵眼',
      scaling: `实际强度 ${effectValue}，每 10 强度约降低 1% 边界受击损耗`,
      visibility: '边界可见并阻挡，归属方按规则通行',
    };
  }

  private getSelectedTemplate(body: HTMLElement): FormationTemplate {
    const firstPlaceable = BUILTIN_FORMATION_TEMPLATES.find((entry) => entry.placeableByDisk !== false)
      ?? BUILTIN_FORMATION_TEMPLATES[0]!;
    const formationId = body.querySelector<HTMLSelectElement>('[data-formation-id]')?.value ?? firstPlaceable.id;
    return BUILTIN_FORMATION_TEMPLATES.find((entry) => entry.id === formationId && entry.placeableByDisk !== false)
      ?? firstPlaceable;
  }

  private syncSetupInputs(body: HTMLElement, template: FormationTemplate): FormationSetup {
    const cost = resolveFormationCostConfig(template);
    const radiusSlider = body.querySelector<HTMLInputElement>('[data-formation-radius-slider]');
    const radiusInput = body.querySelector<HTMLInputElement>('[data-formation-radius-input]');
    const durationSlider = body.querySelector<HTMLInputElement>('[data-formation-duration-slider]');
    const durationInput = body.querySelector<HTMLInputElement>('[data-formation-duration-input]');
    const effectInput = body.querySelector<HTMLInputElement>('[data-formation-effect-value]');
    const defaultDurationMinutes = Math.max(1, Math.round(cost.defaultDurationHours * 60));
    const radiusSource = document.activeElement === radiusSlider ? radiusSlider : radiusInput ?? radiusSlider;
    const durationSource = document.activeElement === durationSlider ? durationSlider : durationInput ?? durationSlider;
    const setup = normalizeFormationSetup(template, {
      radius: this.clampControlNumber(radiusSource?.value, cost.defaultRadius, FORMATION_SETUP_MIN_RADIUS, FORMATION_SETUP_MAX_RADIUS),
      durationHours: this.clampControlNumber(durationSource?.value, defaultDurationMinutes, FORMATION_SETUP_MIN_DURATION_MINUTES, FORMATION_SETUP_MAX_DURATION_MINUTES) / 60,
      effectValue: effectInput ? Number.parseInt(effectInput.value, 10) : cost.minEffectValue,
    });
    const radius = this.clampControlNumber(setup.radius, cost.defaultRadius, FORMATION_SETUP_MIN_RADIUS, FORMATION_SETUP_MAX_RADIUS);
    const durationMinutes = this.clampControlNumber(
      Math.round(setup.durationHours * 60),
      defaultDurationMinutes,
      FORMATION_SETUP_MIN_DURATION_MINUTES,
      FORMATION_SETUP_MAX_DURATION_MINUTES,
    );
    for (const input of [radiusSlider, radiusInput]) {
      if (!input) continue;
      input.min = String(FORMATION_SETUP_MIN_RADIUS);
      input.max = String(FORMATION_SETUP_MAX_RADIUS);
      input.step = '1';
      input.value = String(radius);
    }
    for (const input of [durationSlider, durationInput]) {
      if (!input) continue;
      input.min = String(FORMATION_SETUP_MIN_DURATION_MINUTES);
      input.max = String(FORMATION_SETUP_MAX_DURATION_MINUTES);
      input.step = '1';
      input.value = String(durationMinutes);
    }
    radiusInput?.setAttribute('aria-label', `阵法范围，${FORMATION_SETUP_MIN_RADIUS} 到 ${FORMATION_SETUP_MAX_RADIUS} 格`);
    if (effectInput) {
      effectInput.min = String(cost.minEffectValue);
      effectInput.step = '1';
      effectInput.value = String(setup.effectValue);
    }
    this.setOutputText(body, '[data-formation-default-radius]', cost.defaultRadius, ' 格');
    this.setOutputText(body, '[data-formation-default-duration]', defaultDurationMinutes, ' 分钟');
    this.setOutputText(body, '[data-formation-min-effect]', cost.minEffectValue);
    return { ...setup, radius, durationHours: durationMinutes / 60 };
  }

  private syncPairedInput(body: HTMLElement, input: HTMLInputElement | HTMLSelectElement): void {
    if (!(input instanceof HTMLInputElement)) return;
    const pairs: Array<[string, string]> = [
      ['[data-formation-radius-slider]', '[data-formation-radius-input]'],
      ['[data-formation-duration-slider]', '[data-formation-duration-input]'],
    ];
    for (const [sliderSelector, inputSelector] of pairs) {
      const slider = body.querySelector<HTMLInputElement>(sliderSelector);
      const numberInput = body.querySelector<HTMLInputElement>(inputSelector);
      if (!slider || !numberInput) continue;
      if (input === slider) {
        numberInput.value = slider.value;
        return;
      }
      if (input === numberInput) {
        slider.value = numberInput.value;
        return;
      }
    }
  }

  private bindRangePreviewButton(body: HTMLElement, signal: AbortSignal): void {
    const button = body.querySelector<HTMLButtonElement>('[data-formation-range-preview]');
    if (!button) return;
    const toggle = (visible: boolean) => {
      document.getElementById('detail-modal')?.classList.toggle('formation-range-preview-active', visible);
      document.getElementById('detail-modal-card')?.classList.toggle('formation-range-preview-active', visible);
    };
    const show = () => toggle(true);
    const hide = () => toggle(false);
    button.addEventListener('mouseenter', show, { signal });
    button.addEventListener('mouseleave', hide, { signal });
    button.addEventListener('focus', show, { signal });
    button.addEventListener('blur', hide, { signal });
    button.addEventListener('pointerdown', show, { signal });
    button.addEventListener('pointerup', hide, { signal });
    button.addEventListener('pointercancel', hide, { signal });
  }

  private getCurrentSpiritStoneCount(): number {
    return (this.options.getInventory()?.items ?? []).reduce((total, item) => (
      item.itemId === FORMATION_SPIRIT_STONE_ITEM_ID
        ? total + Math.max(0, Math.trunc(Number(item.count) || 0))
        : total
    ), 0);
  }

  private describeRange(template: FormationTemplate, stats: FormationResolvedStats): string {
    const radius = formatDisplayInteger(stats.radius);
    if (template.range.shape === 'circle') return `圆形半径 ${radius}，覆盖圆内地块`;
    if (template.range.shape === 'checkerboard') return `棋盘半径 ${radius}，只覆盖交错格`;
    return `方形半径 ${radius}，覆盖外框内地块`;
  }

  private formatPercent(value: number): string {
    const normalized = Math.max(0, Math.min(1, Number(value) || 0));
    if (normalized <= 0) return '0%';
    if (normalized >= 0.999999) return '99.99%';
    return `${(normalized * 100).toFixed(2)}%`;
  }

  private formatDuration(durationHours: number): string {
    const minutes = Math.max(1, Math.round(durationHours * 60));
    if (minutes < 60) return `${formatDisplayInteger(minutes)}分钟`;
    if (minutes % 60 === 0) return `${formatDisplayInteger(minutes / 60)}小时`;
    const hours = Math.floor(minutes / 60);
    return `${formatDisplayInteger(hours)}小时${formatDisplayInteger(minutes - hours * 60)}分钟`;
  }

  private formatResourceCost(qiCost: number, spiritStoneCost: number): string {
    return `每日 ${formatDisplayInteger(qiCost)}灵力 / ${formatDisplayInteger(spiritStoneCost)}灵石`;
  }

  private setText(body: HTMLElement, selector: string, text: string): void {
    const node = body.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  }

  private setStatText(body: HTMLElement, key: string, value: number | string, format: 'integer' | 'duration' = 'integer'): void {
    const node = body.querySelector<HTMLOutputElement>(`[data-formation-stat="${key}"]`);
    if (!node) return;
    const text = typeof value === 'string' ? value : format === 'duration' ? this.formatDuration(value) : formatDisplayInteger(value);
    node.value = text;
    node.textContent = text;
  }

  private setOutputText(body: HTMLElement, selector: string, value: number, suffix = ''): void {
    const output = body.querySelector<HTMLOutputElement>(selector);
    if (!output) return;
    const text = `${formatDisplayInteger(value)}${suffix}`;
    output.value = text;
    output.textContent = text;
  }

  private clampControlNumber(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Math.round(Number(value));
    const normalized = Number.isFinite(parsed) ? parsed : Math.round(Number(fallback) || min);
    return Math.max(min, Math.min(max, normalized));
  }
}
