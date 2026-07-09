/**
 * 本文件负责 设置 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { AccountRedeemCodesRes, OfflineGainReportView, PlayerStatisticTotalsView } from '@mud/shared';
import { ROLE_NAME_MAX_LENGTH, ROLE_NAME_MAX_ASCII_LENGTH } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import {
  getUiStyleConfig,
  resetUiStyleConfig,
  UI_COLOR_MODE_OPTIONS,
  UI_GLOBAL_FONT_OFFSET_RANGE,
  UI_SCALE_RANGE,
  updateUiColorMode,
  updateUiGlobalFontOffset,
  updateUiScale,
  type UiColorMode,
} from '../../../ui/ui-style-config';
import {
  getMapPerformanceConfig,
  resetMapPerformanceConfig,
  updateMapPerformanceConfig,
  type MapPerformanceConfig,
} from '../../../ui/performance-config';
import {
  FLOATING_PANEL_PREFERENCES_CHANGED_EVENT,
  getFloatingPanelPreferences,
  updateFloatingPanelPreference,
  type FloatingPanelPreferenceKey,
  type FloatingPanelPreferences,
} from '../../../ui/floating-panel-preferences';
import { validateDisplayName, validatePassword, validateRoleName } from '../../../ui/account-rules';
import { checkDisplayNameAvailability, getAccessToken, updateDisplayName, updatePassword, updateRoleName } from '../../../ui/auth-api';
import { readOfflineGainReportsFromBrowser, readPlayerStatisticTotalsFromBrowser } from '../../../offline-gain-storage';
import {
  createPlayerRuntimeImageResource,
  getRuntimeImageOverride,
  getRuntimeImageOverrides,
  getRuntimeImageReloadListKeys,
  loadRuntimeImageResourceCatalog,
  removeRuntimeImageOverride,
  saveRuntimeImageOverrideEntryFromFile,
  saveRuntimeImageOverrideFromFile,
  setRuntimeImageReloadListKeys,
  type RuntimeImageOverrideEntry,
  type RuntimeImageResourceEntry,
} from '../../../renderer/local-runtime-image-overrides';
import { formatOfflineGainDuration, formatOfflineGainTime, formatSignedAmount, renderOfflineGainReport } from '../../../ui/offline-gain-render';
import { MAP_TARGET_FPS_RANGE } from '../../../constants/ui/performance';
import { t } from '../../../ui/i18n';

type MapPerformanceRenderToggleKey =
  | 'renderRuntimeTileSprites'
  | 'npcTextMode'
  | 'monsterTextMode'
  | 'herbTextMode'
  | 'terrainTextMode';

const PERFORMANCE_RENDER_TOGGLES: Array<{
  key: MapPerformanceRenderToggleKey;
  labelKey: string;
  descKey: string;
}> = [
  {
    key: 'renderRuntimeTileSprites',
    labelKey: 'settings.performance.label.render-runtime-tile-sprites',
    descKey: 'settings.performance.desc.render-runtime-tile-sprites',
  },
  {
    key: 'terrainTextMode',
    labelKey: 'settings.performance.label.terrain-text-mode',
    descKey: 'settings.performance.desc.terrain-text-mode',
  },
  {
    key: 'npcTextMode',
    labelKey: 'settings.performance.label.npc-text-mode',
    descKey: 'settings.performance.desc.npc-text-mode',
  },
  {
    key: 'monsterTextMode',
    labelKey: 'settings.performance.label.monster-text-mode',
    descKey: 'settings.performance.desc.monster-text-mode',
  },
  {
    key: 'herbTextMode',
    labelKey: 'settings.performance.label.herb-text-mode',
    descKey: 'settings.performance.desc.herb-text-mode',
  },
];

const FLOATING_PANEL_TOGGLES: Array<{
  key: FloatingPanelPreferenceKey;
  title: string;
  desc: string;
}> = [
  {
    key: 'actionQueue',
    title: '行动队列',
    desc: '显示技艺通用 jobs 的任务名、数量和当前进度。',
  },
  {
    key: 'interactionList',
    title: '交互列表',
    desc: '显示附近技艺、任务、传送和交互的快捷按钮。',
  },
];

// ─── Store ───────────────────────────────────────────────────────────────────

interface SettingsPanelState {
  accountName: string;
  playerId: string;
  displayName: string;
  roleName: string;
}

export const { store: settingsPanelStore, useStore: useSettingsPanelStore } = createPanelStore<SettingsPanelState>({
  accountName: '',
  playerId: '',
  displayName: '',
  roleName: '',
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface SettingsPanelCallbacks {
  onDisplayNameUpdated: ((displayName: string) => void) | null;
  onRoleNameUpdated: ((roleName: string) => void) | null;
  redeemCodes: ((codes: string[]) => Promise<AccountRedeemCodesRes>) | null;
  onLogout: (() => void) | null;
}

const callbacks: SettingsPanelCallbacks = {
  onDisplayNameUpdated: null,
  onRoleNameUpdated: null,
  redeemCodes: null,
  onLogout: null,
};

export function setSettingsPanelCallbacks(cbs: Partial<SettingsPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type SettingsTab = 'account' | 'redeem' | 'ui' | 'performance' | 'resourceReload' | 'offlineGain';

const TABS: { id: SettingsTab; label: () => string }[] = [
  { id: 'account', label: () => t('settings.tab.account', undefined) },
  { id: 'redeem', label: () => t('settings.tab.redeem', undefined) },
  { id: 'ui', label: () => t('settings.tab.ui', undefined) },
  { id: 'performance', label: () => t('settings.tab.performance', undefined) },
  { id: 'resourceReload', label: () => '资源重载' },
  { id: 'offlineGain', label: () => t('settings.tab.offline-gain', undefined) },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGlobalFontOffset(offset: number): string {
  return offset >= 0 ? `+${offset}px` : `${offset}px`;
}

function formatRuntimeImageOverrideTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '本地覆盖';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function filterRuntimeImageResources(resources: RuntimeImageResourceEntry[], query: string, addedKeys: Set<string>): RuntimeImageResourceEntry[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];
  return resources
    .filter((entry) => !addedKeys.has(entry.key))
    .filter((entry) => {
      const haystack = `${entry.key} ${entry.label} ${entry.src}`.toLowerCase();
      return haystack.includes(keyword);
    })
    .slice(0, 30);
}

function formatRuntimeImageDefaultMeta(entry: RuntimeImageResourceEntry): string {
  return entry.src.startsWith('data:image/') ? '本地图片' : `默认资源 · ${entry.src}`;
}

function parseRedeemCodes(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normalizeStatisticPeriodTotal(v: unknown): {
  spiritStones: { gained: number; lost: number };
  progress: { gained: number; lost: number };
  techniques: { gained: number; lost: number };
  professions: { gained: number; lost: number };
} {
  const empty = { gained: 0, lost: 0 };
  if (!v || typeof v !== 'object') return { spiritStones: empty, progress: empty, techniques: empty, professions: empty };
  const obj = v as Record<string, unknown>;
  const parse = (key: string) => {
    const field = obj[key];
    if (!field || typeof field !== 'object') return empty;
    const f = field as Record<string, unknown>;
    return { gained: Number(f.gained) || 0, lost: Number(f.lost) || 0 };
  };
  return { spiritStones: parse('spiritStones'), progress: parse('progress'), techniques: parse('techniques'), professions: parse('professions') };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const SettingsPanel = memo(function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const state = useSettingsPanelStore();

  return (
    <div className="settings-modal-shell ui-tabbed-modal-shell">
      <div className="settings-modal-tabs ui-tabbed-modal-tabs" role="tablist" aria-label={t('settings.tabs.aria', undefined)}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`settings-modal-tab ui-tabbed-modal-tab${activeTab === tab.id ? ' active' : ''}`}
            type="button"
            aria-selected={activeTab === tab.id ? 'true' : 'false'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label()}
          </button>
        ))}
      </div>
      <div className={`settings-modal-pane ui-tabbed-modal-pane${activeTab === 'account' ? ' active' : ''}`}>
        {activeTab === 'account' && <AccountTab state={state} />}
      </div>
      <div className={`settings-modal-pane ui-tabbed-modal-pane${activeTab === 'redeem' ? ' active' : ''}`}>
        {activeTab === 'redeem' && <RedeemTab />}
      </div>
      <div className={`settings-modal-pane ui-tabbed-modal-pane${activeTab === 'ui' ? ' active' : ''}`}>
        {activeTab === 'ui' && <UiTab />}
      </div>
      <div className={`settings-modal-pane ui-tabbed-modal-pane${activeTab === 'performance' ? ' active' : ''}`}>
        {activeTab === 'performance' && <PerformanceTab />}
      </div>
      <div className={`settings-modal-pane ui-tabbed-modal-pane${activeTab === 'resourceReload' ? ' active' : ''}`}>
        {activeTab === 'resourceReload' && <ResourceReloadTab state={state} />}
      </div>
      <div className={`settings-modal-pane ui-tabbed-modal-pane${activeTab === 'offlineGain' ? ' active' : ''}`}>
        {activeTab === 'offlineGain' && <OfflineGainTab playerId={state.playerId || state.accountName || 'anonymous'} />}
      </div>
    </div>
  );
});

// ─── Account Tab ─────────────────────────────────────────────────────────────

const AccountTab = memo(function AccountTab({ state }: { state: SettingsPanelState }) {
  const [displayNameInput, setDisplayNameInput] = useState(state.displayName);
  const [displayNameStatus, setDisplayNameStatus] = useState('');
  const [displayNameStatusType, setDisplayNameStatusType] = useState<'' | 'success' | 'error'>('');
  const [displayNameAvailable, setDisplayNameAvailable] = useState(true);
  const [roleNameInput, setRoleNameInput] = useState(state.roleName);
  const [roleNameStatus, setRoleNameStatus] = useState('');
  const [roleNameStatusType, setRoleNameStatusType] = useState<'' | 'success' | 'error'>('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordStatusType, setPasswordStatusType] = useState<'' | 'success' | 'error'>('');
  const [submitting, setSubmitting] = useState(false);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleDisplayNameInput = useCallback((value: string) => {
    setDisplayNameInput(value);
    const normalized = value.normalize('NFC');
    if (normalized === state.displayName) {
      setDisplayNameAvailable(true);
      setDisplayNameStatus(t('settings.account.status.display-name-available-current', undefined));
      setDisplayNameStatusType('');
      return;
    }
    const localError = validateDisplayName(normalized);
    if (localError) {
      setDisplayNameAvailable(false);
      setDisplayNameStatus(localError);
      setDisplayNameStatusType('error');
      return;
    }
    setDisplayNameStatus(t('settings.account.status.checking', undefined));
    setDisplayNameStatusType('');
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const result = await checkDisplayNameAvailability(normalized, controller.signal);
        if (controller.signal.aborted) return;
        setDisplayNameAvailable(result.available);
        setDisplayNameStatus(result.available ? t('settings.account.status.display-name-available', undefined) : (result.message ?? t('settings.account.status.display-name-taken', undefined)));
        setDisplayNameStatusType(result.available ? 'success' : 'error');
      } catch {
        if (!controller.signal.aborted) {
          setDisplayNameStatus(t('settings.account.status.check-failed', undefined));
          setDisplayNameStatusType('error');
        }
      }
    }, 250);
  }, [state.displayName]);

  const handleDisplayNameSubmit = useCallback(async () => {
    const normalized = displayNameInput.normalize('NFC');
    if (!displayNameAvailable || !normalized) return;
    setSubmitting(true);
    try {
      const token = getAccessToken();
      if (!token) { setDisplayNameStatus(t('settings.account.error.no-token', undefined)); setDisplayNameStatusType('error'); return; }
      await updateDisplayName(token, { displayName: normalized });
      setDisplayNameStatus(t('settings.account.status.display-name-saved', undefined));
      setDisplayNameStatusType('success');
      callbacks.onDisplayNameUpdated?.(normalized);
    } catch (err) {
      setDisplayNameStatus(err instanceof Error ? err.message : t('settings.account.error.save-failed', undefined));
      setDisplayNameStatusType('error');
    } finally { setSubmitting(false); }
  }, [displayNameInput, displayNameAvailable]);

  const handleRoleNameSubmit = useCallback(async () => {
    const normalized = roleNameInput.normalize('NFC');
    const localError = validateRoleName(normalized);
    if (localError) { setRoleNameStatus(localError); setRoleNameStatusType('error'); return; }
    setSubmitting(true);
    try {
      const token = getAccessToken();
      if (!token) { setRoleNameStatus(t('settings.account.error.no-token', undefined)); setRoleNameStatusType('error'); return; }
      await updateRoleName(token, { roleName: normalized });
      setRoleNameStatus(t('settings.account.status.role-name-saved', undefined));
      setRoleNameStatusType('success');
      callbacks.onRoleNameUpdated?.(normalized);
    } catch (err) {
      setRoleNameStatus(err instanceof Error ? err.message : t('settings.account.error.save-failed', undefined));
      setRoleNameStatusType('error');
    } finally { setSubmitting(false); }
  }, [roleNameInput]);

  const handlePasswordSubmit = useCallback(async () => {
    const pwError = validatePassword(newPassword);
    if (pwError) { setPasswordStatus(pwError); setPasswordStatusType('error'); return; }
    if (!currentPassword) { setPasswordStatus(t('settings.account.error.current-password-required', undefined)); setPasswordStatusType('error'); return; }
    setSubmitting(true);
    try {
      const token = getAccessToken();
      if (!token) { setPasswordStatus(t('settings.account.error.no-token', undefined)); setPasswordStatusType('error'); return; }
      await updatePassword(token, { currentPassword, newPassword });
      setPasswordStatus(t('settings.account.status.password-saved', undefined));
      setPasswordStatusType('success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordStatus(err instanceof Error ? err.message : t('settings.account.error.save-failed', undefined));
      setPasswordStatusType('error');
    } finally { setSubmitting(false); }
  }, [currentPassword, newPassword]);

  return (
    <>
      <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">{t('settings.account.section.account', undefined)}</div>
        <div className="account-settings-copy ui-form-copy">{t('settings.account.copy.account', undefined)}</div>
        <div className="account-settings-field ui-form-field">
          <label className="ui-form-label">{t('settings.account.label.current-account', undefined)}</label>
          <input className="ui-input" type="text" value={state.accountName} readOnly />
        </div>
      </div>
      <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">{t('settings.account.section.names', undefined)}</div>
        <div className="account-settings-copy ui-form-copy">{t('settings.account.copy.names', { roleNameMaxLength: ROLE_NAME_MAX_LENGTH, roleNameMaxAsciiLength: ROLE_NAME_MAX_ASCII_LENGTH })}</div>
        <div className="account-settings-name-grid ui-form-grid ui-form-grid--two-column">
          <div className="account-settings-field account-settings-field--display ui-form-field">
            <label className="ui-form-label">{t('settings.account.label.display-name', undefined)}</label>
            <input className="account-settings-display-input ui-input" type="text" maxLength={1} value={displayNameInput} placeholder={t('settings.account.placeholder.display-name', undefined)} onChange={(e) => handleDisplayNameInput(e.target.value)} />
            <div className={`account-settings-status ui-status-text${displayNameStatusType ? ` ${displayNameStatusType}` : ''}`}>{displayNameStatus}</div>
            <div className="account-settings-actions ui-inline-actions-end ui-action-row">
              <button className="small-btn" type="button" disabled={submitting || !displayNameAvailable} onClick={handleDisplayNameSubmit}>{t('settings.account.action.save-display-name', undefined)}</button>
            </div>
          </div>
          <div className="account-settings-field account-settings-field--role ui-form-field">
            <label className="ui-form-label">{t('settings.account.label.role-name', undefined)}</label>
            <input className="account-settings-role-input ui-input" type="text" value={roleNameInput} placeholder={t('settings.account.placeholder.role-name', undefined)} onChange={(e) => setRoleNameInput(e.target.value)} />
            <div className={`account-settings-status ui-status-text${roleNameStatusType ? ` ${roleNameStatusType}` : ''}`}>{roleNameStatus}</div>
            <div className="account-settings-actions ui-inline-actions-end ui-action-row">
              <button className="small-btn" type="button" disabled={submitting} onClick={handleRoleNameSubmit}>{t('settings.account.action.save-role-name', undefined)}</button>
            </div>
          </div>
        </div>
      </div>
      <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">{t('settings.account.section.password', undefined)}</div>
        <div className="account-settings-field ui-form-field">
          <label className="ui-form-label">{t('settings.account.label.current-password', undefined)}</label>
          <input className="ui-input" type="password" value={currentPassword} placeholder={t('settings.account.placeholder.current-password', undefined)} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="account-settings-field ui-form-field">
          <label className="ui-form-label">{t('settings.account.label.new-password', undefined)}</label>
          <input className="ui-input" type="password" value={newPassword} placeholder={t('settings.account.placeholder.new-password', undefined)} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className={`account-settings-status ui-status-text${passwordStatusType ? ` ${passwordStatusType}` : ''}`}>{passwordStatus}</div>
        <div className="account-settings-actions ui-inline-actions-end ui-action-row">
          <button className="small-btn" type="button" disabled={submitting} onClick={handlePasswordSubmit}>{t('settings.account.action.save-password', undefined)}</button>
        </div>
      </div>
    </>
  );

});

// ─── Redeem Tab ──────────────────────────────────────────────────────────────

const RedeemTab = memo(function RedeemTab() {
  const [codes, setCodes] = useState('');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'' | 'success' | 'error'>('');
  const [results, setResults] = useState<AccountRedeemCodesRes['results'] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const parsed = parseRedeemCodes(codes);
    if (parsed.length === 0) {
      setStatus(t('settings.redeem.error.empty', undefined));
      setStatusType('error');
      setResults(null);
      return;
    }
    if (!callbacks.redeemCodes) return;
    setSubmitting(true);
    setStatus(t('settings.redeem.status.submitted', undefined));
    setStatusType('');
    setResults(null);
    try {
      const result = await callbacks.redeemCodes(parsed);
      const successCount = result.results.filter((e) => e.ok).length;
      const failedCount = result.results.length - successCount;
      setStatus(failedCount > 0
        ? t('settings.redeem.status.result-mixed', { successCount, failedCount })
        : t('settings.redeem.status.result-success', { successCount }));
      setStatusType(failedCount > 0 ? 'error' : 'success');
      setResults(result.results);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t('settings.redeem.error.failed', undefined));
      setStatusType('error');
      setResults(null);
    } finally { setSubmitting(false); }
  }, [codes]);

  return (
    <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">{t('settings.redeem.section.bulk', undefined)}</div>
      <div className="settings-ui-copy ui-form-copy">{t('settings.redeem.copy.bulk', undefined)}</div>
      <div className="account-settings-field ui-form-field">
        <label className="ui-form-label">{t('settings.redeem.label.codes', undefined)}</label>
        <textarea
          className="settings-redeem-textarea ui-textarea"
          spellCheck={false}
          placeholder={t('settings.redeem.placeholder.codes', undefined)}
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
        />
      </div>
      <div className="account-settings-actions ui-inline-actions-end ui-action-row">
        <button className="small-btn" type="button" disabled={submitting} onClick={handleSubmit}>
          {t('settings.redeem.action.submit', undefined)}
        </button>
      </div>
      <div className={`account-settings-status ui-status-text${statusType ? ` ${statusType}` : ''}`}>{status}</div>
      {results && results.length > 0 && (
        <div className="settings-redeem-results ui-card-list">
          {results.map((entry, idx) => (
            <div key={`${entry.code}-${idx}`} className={`settings-redeem-result ui-surface-card ui-surface-card--compact${entry.ok ? ' success' : ' error'}`}>
              <div className="settings-redeem-result-head">
                <span>{entry.code}</span>
                <span>{entry.ok ? t('settings.redeem.result.success', undefined) : t('settings.redeem.result.failed', undefined)}</span>
              </div>
              <div className="settings-redeem-result-body">
                {entry.groupName ? `${entry.groupName} · ${entry.message}` : entry.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─── UI Tab ──────────────────────────────────────────────────────────────────

const UiTab = memo(function UiTab() {
  const [colorMode, setColorMode] = useState<UiColorMode>(() => getUiStyleConfig().colorMode);
  const [fontOffset, setFontOffset] = useState(() => getUiStyleConfig().globalFontOffset);
  const [uiScale, setUiScale] = useState(() => getUiStyleConfig().uiScale);
  const [floatingPanels, setFloatingPanels] = useState(() => getFloatingPanelPreferences());
  const [status, setStatus] = useState(t('settings.ui.status.saved-local', undefined));

  const handleColorMode = useCallback((mode: UiColorMode) => {
    const next = updateUiColorMode(mode);
    setColorMode(mode);
    setFontOffset(next.globalFontOffset);
    setUiScale(next.uiScale);
    setStatus(t('settings.status.color-mode-switched', {
      mode: mode === 'dark' ? t('settings.status.mode.dark', undefined) : t('settings.status.mode.light', undefined),
    }));
  }, []);

  const handleFontOffset = useCallback((raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const value = Number.isFinite(parsed)
      ? Math.max(UI_GLOBAL_FONT_OFFSET_RANGE.min, Math.min(UI_GLOBAL_FONT_OFFSET_RANGE.max, parsed))
      : UI_GLOBAL_FONT_OFFSET_RANGE.defaultValue;
    const next = updateUiGlobalFontOffset(value);
    setFontOffset(next.globalFontOffset);
    setStatus(t('settings.status.font-adjusted', undefined));
  }, []);

  const handleScale = useCallback((raw: string) => {
    const parsed = Number.parseFloat(raw);
    const value = Number.isFinite(parsed)
      ? Math.max(UI_SCALE_RANGE.min, Math.min(UI_SCALE_RANGE.max, parsed))
      : UI_SCALE_RANGE.defaultValue;
    const next = updateUiScale(value);
    setUiScale(next.uiScale);
    setStatus(t('settings.status.scale-adjusted', undefined));
  }, []);

  const handleReset = useCallback(() => {
    const next = resetUiStyleConfig();
    setColorMode(next.colorMode);
    setFontOffset(next.globalFontOffset);
    setUiScale(next.uiScale);
    setStatus(t('settings.status.ui-reset', undefined));
  }, []);

  useEffect(() => {
    const handleFloatingPanelPreferenceChange = (event: Event) => {
      const next = event instanceof CustomEvent
        ? event.detail as FloatingPanelPreferences
        : getFloatingPanelPreferences();
      setFloatingPanels(next);
    };
    window.addEventListener(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, handleFloatingPanelPreferenceChange);
    return () => window.removeEventListener(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, handleFloatingPanelPreferenceChange);
  }, []);

  const handleFloatingPanelToggle = useCallback((key: FloatingPanelPreferenceKey, enabled: boolean) => {
    const next = updateFloatingPanelPreference(key, enabled);
    setFloatingPanels(next);
    setStatus(enabled ? '悬浮窗已开启' : '悬浮窗已关闭，可在这里重新开启');
  }, []);

  return (
    <>
      <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">{t('settings.ui.section.color-mode', undefined)}</div>
        <div className="settings-ui-copy ui-form-copy">{t('settings.ui.copy.color-mode', undefined)}</div>
        <div className="settings-ui-mode-row">
          {UI_COLOR_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`small-btn ghost${colorMode === option.value ? ' active' : ''}`}
              type="button"
              aria-pressed={colorMode === option.value ? 'true' : 'false'}
              aria-label={option.description}
              onClick={() => handleColorMode(option.value as UiColorMode)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div className="settings-ui-table-head">
          <div className="panel-section-title">{t('settings.ui.section.display', undefined)}</div>
          <button className="small-btn ghost" type="button" onClick={handleReset}>{t('settings.common.action.reset-default', undefined)}</button>
        </div>
        <div className="settings-ui-copy ui-form-copy">{t('settings.ui.copy.display', undefined)}</div>
        <div className="settings-ui-table ui-data-table">
          <div className="settings-ui-table-row ui-data-table-row">
            <div className="settings-ui-level-meta ui-data-table-meta">
              <div className="settings-ui-level-name ui-data-table-name">{t('settings.ui.label.global-font', undefined)}</div>
              <div className="settings-ui-level-desc ui-data-table-desc">{t('settings.ui.desc.global-font', undefined)}</div>
            </div>
            <div className="settings-ui-level-slider ui-data-table-control">
              <input type="range" min={UI_GLOBAL_FONT_OFFSET_RANGE.min} max={UI_GLOBAL_FONT_OFFSET_RANGE.max} step={UI_GLOBAL_FONT_OFFSET_RANGE.step} value={fontOffset} onChange={(e) => handleFontOffset(e.target.value)} />
            </div>
            <div className="settings-ui-level-input ui-data-table-input-group">
              <input className="ui-input" type="number" min={UI_GLOBAL_FONT_OFFSET_RANGE.min} max={UI_GLOBAL_FONT_OFFSET_RANGE.max} step={UI_GLOBAL_FONT_OFFSET_RANGE.step} value={fontOffset} onChange={(e) => handleFontOffset(e.target.value)} />
              <span>{formatGlobalFontOffset(fontOffset)}</span>
            </div>
            <div className="settings-ui-level-preview settings-ui-level-preview--body ui-data-table-preview ui-data-table-preview--body">{t('settings.ui.preview.body', undefined)}</div>
          </div>
          <div className="settings-ui-table-row ui-data-table-row">
            <div className="settings-ui-level-meta ui-data-table-meta">
              <div className="settings-ui-level-name ui-data-table-name">{t('settings.ui.label.scale', undefined)}</div>
              <div className="settings-ui-level-desc ui-data-table-desc">{t('settings.ui.desc.scale', undefined)}</div>
            </div>
            <div className="settings-ui-level-slider ui-data-table-control">
              <input type="range" min={UI_SCALE_RANGE.min} max={UI_SCALE_RANGE.max} step={UI_SCALE_RANGE.step} value={uiScale.toFixed(2)} onChange={(e) => handleScale(e.target.value)} />
            </div>
            <div className="settings-ui-level-input ui-data-table-input-group">
              <input className="ui-input" type="number" min={UI_SCALE_RANGE.min} max={UI_SCALE_RANGE.max} step={UI_SCALE_RANGE.step} value={uiScale.toFixed(2)} onChange={(e) => handleScale(e.target.value)} />
              <span>{Math.round(uiScale * 100)}%</span>
            </div>
            <div className="settings-ui-level-preview settings-ui-level-preview--title ui-data-table-preview ui-data-table-preview--title">{t('settings.ui.preview.scale', undefined)}</div>
          </div>
        </div>
        <div className="account-settings-status ui-status-text">{status}</div>
      </div>
      <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">悬浮窗</div>
        <div className="settings-ui-copy ui-form-copy">关闭后的悬浮窗不会自动显示，可在这里重新开启。</div>
        <div className="settings-performance-card ui-card-list">
          {FLOATING_PANEL_TOGGLES.map((item) => (
            <div key={item.key} className="settings-performance-row ui-data-table-row">
              <div className="settings-performance-meta ui-data-table-meta">
                <div className="settings-performance-name ui-data-table-name">{item.title}</div>
                <div className="settings-performance-desc ui-data-table-desc">{item.desc}</div>
              </div>
              <div className="settings-performance-actions ui-inline-actions-end-wrap">
                <button className={`small-btn ghost${!floatingPanels[item.key] ? ' active' : ''}`} type="button" aria-pressed={!floatingPanels[item.key] ? 'true' : 'false'} onClick={() => handleFloatingPanelToggle(item.key, false)}>关</button>
                <button className={`small-btn ghost${floatingPanels[item.key] ? ' active' : ''}`} type="button" aria-pressed={floatingPanels[item.key] ? 'true' : 'false'} onClick={() => handleFloatingPanelToggle(item.key, true)}>开</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
});

// ─── Performance Tab ─────────────────────────────────────────────────────────

const PerformanceTab = memo(function PerformanceTab() {
  const [config, setConfig] = useState<MapPerformanceConfig>(() => getMapPerformanceConfig());
  const [status, setStatus] = useState(t('settings.ui.status.saved-local', undefined));

  const handleFpsToggle = useCallback((on: boolean) => {
    const next = updateMapPerformanceConfig({ showFpsMonitor: on });
    setConfig(next);
    setStatus(next.showFpsMonitor ? t('settings.status.fps-shown', undefined) : t('settings.status.fps-hidden', undefined));
  }, []);

  const handleProfilerToggle = useCallback((on: boolean) => {
    const next = updateMapPerformanceConfig({ showPixiProfiler: on });
    setConfig(next);
    setStatus(next.showPixiProfiler ? t('settings.status.pixi-profiler-shown', undefined) : t('settings.status.pixi-profiler-hidden', undefined));
  }, []);

  const handleTargetFps = useCallback((raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const value = Number.isFinite(parsed)
      ? Math.max(MAP_TARGET_FPS_RANGE.min, Math.min(MAP_TARGET_FPS_RANGE.max, parsed))
      : MAP_TARGET_FPS_RANGE.defaultValue;
    const next = updateMapPerformanceConfig({ targetFps: value });
    setConfig(next);
    setStatus(t('settings.status.target-fps-adjusted', { fps: next.targetFps }));
  }, []);

  const handleRenderToggle = useCallback((key: MapPerformanceRenderToggleKey, value: boolean) => {
    const next = updateMapPerformanceConfig({ [key]: value });
    setConfig(next);
    setStatus(t('settings.status.render-toggle-adjusted', undefined));
  }, []);

  const handleReset = useCallback(() => {
    const next = resetMapPerformanceConfig();
    setConfig(next);
    setStatus(t('settings.status.performance-reset', undefined));
  }, []);

  return (
    <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
      <div className="settings-ui-table-head">
        <div className="panel-section-title">{t('settings.performance.section.overlay', undefined)}</div>
        <button className="small-btn ghost" type="button" onClick={handleReset}>{t('settings.common.action.reset-default', undefined)}</button>
      </div>
      <div className="settings-ui-copy ui-form-copy">{t('settings.performance.copy.overlay', undefined)}</div>
      <div className="settings-performance-card ui-card-list">
        <div className="settings-performance-row ui-data-table-row">
          <div className="settings-performance-meta ui-data-table-meta">
            <div className="settings-performance-name ui-data-table-name">{t('settings.performance.label.show-fps', undefined)}</div>
            <div className="settings-performance-desc ui-data-table-desc">{t('settings.performance.desc.show-fps', undefined)}</div>
          </div>
          <div className="settings-performance-actions ui-inline-actions-end-wrap">
            <button className={`small-btn ghost${!config.showFpsMonitor ? ' active' : ''}`} type="button" aria-pressed={!config.showFpsMonitor ? 'true' : 'false'} onClick={() => handleFpsToggle(false)}>{t('settings.common.action.off', undefined)}</button>
            <button className={`small-btn ghost${config.showFpsMonitor ? ' active' : ''}`} type="button" aria-pressed={config.showFpsMonitor ? 'true' : 'false'} onClick={() => handleFpsToggle(true)}>{t('settings.common.action.show', undefined)}</button>
          </div>
        </div>
        <div className="settings-performance-row ui-data-table-row">
          <div className="settings-performance-meta ui-data-table-meta">
            <div className="settings-performance-name ui-data-table-name">{t('settings.performance.label.target-fps', undefined)}</div>
            <div className="settings-performance-desc ui-data-table-desc">{t('settings.performance.desc.target-fps', { min: MAP_TARGET_FPS_RANGE.min, max: MAP_TARGET_FPS_RANGE.max })}</div>
          </div>
          <div className="settings-performance-actions ui-inline-actions-end-wrap settings-performance-actions--numeric">
            <input className="settings-performance-number-input ui-input" type="number" inputMode="numeric" min={MAP_TARGET_FPS_RANGE.min} max={MAP_TARGET_FPS_RANGE.max} step={1} value={config.targetFps} onChange={(e) => handleTargetFps(e.target.value)} />
            <span className="settings-performance-number-unit">FPS</span>
          </div>
        </div>
        <div className="settings-performance-row ui-data-table-row">
          <div className="settings-performance-meta ui-data-table-meta">
            <div className="settings-performance-name ui-data-table-name">{t('settings.performance.label.pixi-profiler', undefined)}</div>
            <div className="settings-performance-desc ui-data-table-desc">{t('settings.performance.desc.pixi-profiler', undefined)}</div>
          </div>
          <div className="settings-performance-actions ui-inline-actions-end-wrap">
            <button className={`small-btn ghost${!config.showPixiProfiler ? ' active' : ''}`} type="button" aria-pressed={!config.showPixiProfiler ? 'true' : 'false'} onClick={() => handleProfilerToggle(false)}>{t('settings.common.action.off', undefined)}</button>
            <button className={`small-btn ghost${config.showPixiProfiler ? ' active' : ''}`} type="button" aria-pressed={config.showPixiProfiler ? 'true' : 'false'} onClick={() => handleProfilerToggle(true)}>{t('settings.common.action.show', undefined)}</button>
          </div>
        </div>
        {PERFORMANCE_RENDER_TOGGLES.map((item) => (
          <div key={item.key} className="settings-performance-row ui-data-table-row">
            <div className="settings-performance-meta ui-data-table-meta">
              <div className="settings-performance-name ui-data-table-name">{t(item.labelKey, undefined)}</div>
              <div className="settings-performance-desc ui-data-table-desc">{t(item.descKey, undefined)}</div>
            </div>
            <div className="settings-performance-actions ui-inline-actions-end-wrap">
              <button className={`small-btn ghost${!config[item.key] ? ' active' : ''}`} type="button" aria-pressed={!config[item.key] ? 'true' : 'false'} onClick={() => handleRenderToggle(item.key, false)}>{t('settings.common.action.off', undefined)}</button>
              <button className={`small-btn ghost${config[item.key] ? ' active' : ''}`} type="button" aria-pressed={config[item.key] ? 'true' : 'false'} onClick={() => handleRenderToggle(item.key, true)}>{t('settings.common.action.on', undefined)}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="account-settings-status ui-status-text">{status}</div>
    </div>
  );
});

// ─── Resource Reload Tab ─────────────────────────────────────────────────────

const ResourceReloadTab = memo(function ResourceReloadTab({ state }: { state: SettingsPanelState }) {
  const [resources, setResources] = useState<RuntimeImageResourceEntry[]>([]);
  const [addedKeys, setAddedKeys] = useState<string[]>(() => getRuntimeImageReloadListKeys());
  const [overrides, setOverrides] = useState<RuntimeImageOverrideEntry[]>(() => getRuntimeImageOverrides());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('默认列表为空，请先搜索资源名称并添加到本地重载列表。');

  useEffect(() => {
    let active = true;
    loadRuntimeImageResourceCatalog()
      .then((entries) => {
        if (!active) return;
        setResources(entries);
      })
      .catch(() => {
        if (!active) return;
        setStatus('资源目录加载失败，请稍后重试。');
      });
    return () => {
      active = false;
    };
  }, []);

  const addedKeySet = new Set(addedKeys);
  const searchResults = filterRuntimeImageResources(resources, query, addedKeySet);
  const addedResources = addedKeys
    .map((key) => resources.find((entry) => entry.key === key))
    .filter((entry): entry is RuntimeImageResourceEntry => entry !== undefined);
  const playerResource = createPlayerRuntimeImageResource({
    playerId: state.playerId,
    displayName: state.displayName,
    roleName: state.roleName,
  });

  const refreshOverrides = useCallback(() => {
    setOverrides(getRuntimeImageOverrides());
  }, []);

  const handleAddResource = useCallback((entry: RuntimeImageResourceEntry) => {
    setAddedKeys((current) => {
      const next = current.includes(entry.key) ? current : [...current, entry.key];
      setRuntimeImageReloadListKeys(next);
      return next;
    });
    setQuery('');
    setStatus(`已添加 ${entry.label}，可选择本地图片进行重载。`);
  }, []);

  const handleRemoveResource = useCallback((key: string) => {
    setAddedKeys((current) => {
      const next = current.filter((item) => item !== key);
      setRuntimeImageReloadListKeys(next);
      return next;
    });
    setStatus('已从本地重载列表移除。');
  }, []);

  const handleFileChange = useCallback(async (key: string, file: File | undefined) => {
    if (!file) return;
    try {
      await saveRuntimeImageOverrideFromFile(key, file);
      refreshOverrides();
      setStatus('图片已保存到本机，并已通知地图渲染刷新。');
    } catch (error) {
      const message = error instanceof Error && error.message === 'local_runtime_image_override_storage_failed'
        ? '保存失败：浏览器本地存储空间不足。'
        : '保存失败：请选择有效图片文件。';
      setStatus(message);
    }
  }, [refreshOverrides]);

  const handleEntryFileChange = useCallback(async (entry: RuntimeImageResourceEntry, file: File | undefined) => {
    if (!file) return;
    try {
      await saveRuntimeImageOverrideEntryFromFile(entry, file);
      refreshOverrides();
      setStatus(entry.key.startsWith('player:')
        ? '我的形象已保存到本机，并已通知地图渲染刷新。'
        : '图片已保存到本机，并已通知地图渲染刷新。');
    } catch (error) {
      const message = error instanceof Error && error.message === 'local_runtime_image_override_storage_failed'
        ? '保存失败：浏览器本地存储空间不足。'
        : '保存失败：请选择有效图片文件。';
      setStatus(message);
    }
  }, [refreshOverrides]);

  const handleResetOverride = useCallback((key: string) => {
    removeRuntimeImageOverride(key);
    refreshOverrides();
    setStatus('已恢复默认图片。');
  }, [refreshOverrides]);

  const overrideByKey = new Map(overrides.map((entry) => [entry.key, entry]));

  return (
    <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack settings-resource-reload-shell">
      <div className="settings-ui-table-head">
        <div className="panel-section-title">本地资源重载</div>
      </div>
      <div className="settings-ui-copy ui-form-copy">仅在当前设备生效。先按名称、资源 key 或图片路径搜索并添加资源，再为列表中的单项选择本地图片。</div>
      {playerResource && (
        <div className="settings-resource-reload-list ui-card-list">
          {(() => {
            const override = overrideByKey.get(playerResource.key) ?? getRuntimeImageOverride(playerResource.key);
            return (
              <div className="settings-resource-reload-row ui-data-table-row">
                <div className="settings-resource-reload-preview" aria-hidden="true">
                  {override ? <img src={override.dataUrl} alt="" /> : <span>默认</span>}
                </div>
                <div className="settings-performance-meta ui-data-table-meta">
                  <div className="settings-performance-name ui-data-table-name">{playerResource.label}</div>
                  <div className="settings-performance-desc ui-data-table-desc">{playerResource.key}</div>
                  <div className="settings-resource-reload-meta">{override ? `${override.fileName || '本地图片'} · ${formatRuntimeImageOverrideTime(override.updatedAt)}` : '当前玩家专属覆盖，不影响其他玩家显示。'}</div>
                </div>
                <div className="settings-resource-reload-actions ui-inline-actions-end-wrap">
                  <label className="small-btn ghost settings-resource-reload-file">
                    选择图片
                    <input type="file" accept="image/*" onChange={(event) => void handleEntryFileChange(playerResource, event.target.files?.[0])} />
                  </label>
                  <button className="small-btn ghost" type="button" disabled={!override} onClick={() => handleResetOverride(playerResource.key)}>恢复默认</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      <div className="settings-resource-reload-search ui-form-field">
        <label className="ui-form-label">搜索资源</label>
        <input
          className="ui-input"
          type="search"
          value={query}
          placeholder="例如 草地、刃竹螳、竹隐客、npc_bamboo"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {searchResults.length > 0 && (
        <div className="settings-resource-reload-results ui-card-list">
          {searchResults.map((entry) => (
            <div key={entry.key} className="settings-resource-reload-result ui-data-table-row">
              <div className="settings-performance-meta ui-data-table-meta">
                <div className="settings-performance-name ui-data-table-name">{entry.label}</div>
                <div className="settings-performance-desc ui-data-table-desc">{entry.key} · {entry.src}</div>
              </div>
              <div className="settings-performance-actions ui-inline-actions-end-wrap">
                <button className="small-btn ghost" type="button" onClick={() => handleAddResource(entry)}>添加</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {addedResources.length === 0 ? (
        <div className="ui-empty-hint compact settings-resource-reload-empty">列表为空。搜索资源后点击添加。</div>
      ) : (
        <div className="settings-resource-reload-list ui-card-list">
          {addedResources.map((entry) => {
            const override = overrideByKey.get(entry.key) ?? getRuntimeImageOverride(entry.key);
            return (
              <div key={entry.key} className="settings-resource-reload-row ui-data-table-row">
                <div className="settings-resource-reload-preview" aria-hidden="true">
                  {override ? <img src={override.dataUrl} alt="" /> : <span>默认</span>}
                </div>
                <div className="settings-performance-meta ui-data-table-meta">
                  <div className="settings-performance-name ui-data-table-name">{entry.label}</div>
                  <div className="settings-performance-desc ui-data-table-desc">{entry.key}</div>
                  <div className="settings-resource-reload-meta">{override ? `${override.fileName || '本地图片'} · ${formatRuntimeImageOverrideTime(override.updatedAt)}` : formatRuntimeImageDefaultMeta(entry)}</div>
                </div>
                <div className="settings-resource-reload-actions ui-inline-actions-end-wrap">
                  <label className="small-btn ghost settings-resource-reload-file">
                    选择图片
                    <input type="file" accept="image/*" onChange={(event) => void handleFileChange(entry.key, event.target.files?.[0])} />
                  </label>
                  <button className="small-btn ghost" type="button" disabled={!override} onClick={() => handleResetOverride(entry.key)}>恢复默认</button>
                  <button className="small-btn ghost" type="button" onClick={() => handleRemoveResource(entry.key)}>移除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="account-settings-status ui-status-text">{status}</div>
    </div>
  );
});

// ─── Offline Gain Tab ────────────────────────────────────────────────────────

const OfflineGainTab = memo(function OfflineGainTab({ playerId }: { playerId: string }) {
  const [reports, setReports] = useState<OfflineGainReportView[]>(() => readOfflineGainReportsFromBrowser(playerId));
  const [totals, setTotals] = useState<PlayerStatisticTotalsView | null>(() => readPlayerStatisticTotalsFromBrowser(playerId));
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    setReports(readOfflineGainReportsFromBrowser(playerId));
    setTotals(readPlayerStatisticTotalsFromBrowser(playerId));
    setSelectedId('');
  }, [playerId]);

  const refresh = useCallback(() => {
    setReports(readOfflineGainReportsFromBrowser(playerId));
    setTotals(readPlayerStatisticTotalsFromBrowser(playerId));
  }, [playerId]);

  const selected = reports.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack settings-offline-gain-shell">
      <div className="settings-ui-table-head">
        <div className="panel-section-title">{t('settings.offline-gain.section.title', undefined)}</div>
        <button className="small-btn ghost" type="button" onClick={refresh}>{t('settings.common.action.refresh', undefined)}</button>
      </div>
      <div className="settings-ui-copy ui-form-copy">{t('settings.offline-gain.copy.summary', undefined)}</div>
      <OfflineGainSummary totals={totals} />
      {reports.length === 0 ? (
        <div className="ui-empty-hint compact settings-offline-gain-empty">{t('settings.offline-gain.empty.history', undefined)}</div>
      ) : (
        <div className="settings-offline-gain-history-layout">
          <div className="settings-offline-gain-record-list" role="listbox" aria-label={t('settings.offline-gain.aria.history', undefined)}>
            {reports.map((report) => (
              <button
                key={report.id}
                className={`settings-offline-gain-record${report.id === (selected?.id ?? '') ? ' active' : ''}`}
                type="button"
                role="option"
                aria-selected={report.id === (selected?.id ?? '') ? 'true' : 'false'}
                onClick={() => setSelectedId(report.id)}
              >
                <span className="settings-offline-gain-record-time">{formatOfflineGainTime(report.endedAt)}</span>
                <span className="settings-offline-gain-record-duration">{formatOfflineGainDuration(report.durationMs)}</span>
              </button>
            ))}
          </div>
          <div className="settings-offline-gain-detail">
            {selected ? (
              <div dangerouslySetInnerHTML={{ __html: renderOfflineGainReport(selected) }} />
            ) : (
              <div className="ui-empty-hint compact settings-offline-gain-empty">点击左侧记录查看详情</div>
            )}
          </div>
        </div>
      )}
      <div className="account-settings-status ui-status-text">{t('settings.offline-gain.status.source', undefined)}</div>
    </div>
  );
});

const OfflineGainSummary = memo(function OfflineGainSummary({ totals }: { totals: PlayerStatisticTotalsView | null }) {
  const periods: { label: string; key: 'today' | 'yesterday' | 'week' }[] = [
    { label: t('settings.offline-gain.period.today', undefined), key: 'today' },
    { label: t('settings.offline-gain.period.yesterday', undefined), key: 'yesterday' },
    { label: t('settings.offline-gain.period.week', undefined), key: 'week' },
  ];

  return (
    <div className="settings-offline-gain-summary">
      {periods.map(({ label, key }) => {
        const total = normalizeStatisticPeriodTotal(totals?.[key]);
        return (
          <div key={key} className="settings-offline-gain-stat ui-surface-card ui-surface-card--compact">
            <span className="settings-offline-gain-stat-title">{label}</span>
            <div className="settings-offline-gain-stat-line">
              <small>{t('settings.offline-gain.metric.spirit-stones', undefined)}</small>
              <strong>{formatSignedAmount(total.spiritStones.gained, total.spiritStones.lost)}</strong>
            </div>
            <div className="settings-offline-gain-stat-line">
              <small>{t('settings.offline-gain.metric.progress', undefined)}</small>
              <strong>{formatSignedAmount(total.progress.gained, total.progress.lost)}</strong>
            </div>
            <div className="settings-offline-gain-stat-line">
              <small>{t('settings.offline-gain.metric.techniques', undefined)}</small>
              <strong>{formatSignedAmount(total.techniques.gained, total.techniques.lost)}</strong>
            </div>
            <div className="settings-offline-gain-stat-line">
              <small>{t('settings.offline-gain.metric.professions', undefined)}</small>
              <strong>{formatSignedAmount(total.professions.gained, total.professions.lost)}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
});
