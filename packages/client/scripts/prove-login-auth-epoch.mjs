#!/usr/bin/env node

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const clientRoot = fileURLToPath(new URL('..', import.meta.url));

class FakeStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

class FakeClassList {
  values = new Set();

  add(...tokens) {
    tokens.forEach((token) => this.values.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
  }

  toggle(token, force) {
    const next = force ?? !this.values.has(token);
    if (next) {
      this.values.add(token);
    } else {
      this.values.delete(token);
    }
    return next;
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  classList = new FakeClassList();
  attributes = new Map();
  listeners = new Map();
  textContent = '';
  value = '';
  placeholder = '';
  autocomplete = '';

  constructor(id = '') {
    this.id = id;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault() {}, ...event });
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  appendChild() {}
}

class FakeDocument {
  elements = new Map();
  body = new FakeElement('body');

  add(id) {
    const element = new FakeElement(id);
    this.elements.set(id, element);
    return element;
  }

  getElementById(id) {
    return this.elements.get(id) ?? null;
  }

  createElement() {
    return new FakeElement();
  }
}

function createLoginDom() {
  const document = new FakeDocument();
  const elements = {};
  for (const id of [
    'login-overlay',
    'tab-login',
    'tab-register',
    'login-name-group',
    'login-name-label',
    'input-login-name',
    'input-password',
    'register-account-group',
    'input-account-name',
    'register-name-row',
    'input-role-name',
    'input-display-name',
    'display-name-status',
    'register-invitation-code-group',
    'input-invitation-code',
    'btn-auth-submit',
    'auth-submit-text',
    'login-error',
    'hud',
  ]) {
    elements[id] = document.add(id);
  }
  elements.hud.classList.add('hidden');
  return { document, elements };
}

const sessionStorage = new FakeStorage();
const localStorage = new FakeStorage();
const pendingRequests = [];

globalThis.window = {
  sessionStorage,
  localStorage,
  location: { search: '', hash: '' },
  addEventListener() {},
  setTimeout,
};
globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
  pendingRequests.push({ url: String(url), options, resolve, reject });
});

function respond(request, data, status = 200) {
  request.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

async function waitFor(predicate, message) {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(message);
}

async function waitForRequests(count, message) {
  await waitFor(() => pendingRequests.length >= count, message);
}

async function settleAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function resetHarness(clearStoredTokens) {
  pendingRequests.splice(0);
  sessionStorage.clear();
  localStorage.clear();
  clearStoredTokens();
}

function createLoginHarness(LoginUI) {
  const dom = createLoginDom();
  globalThis.document = dom.document;
  globalThis.window.document = dom.document;
  const connections = [];
  const ui = new LoginUI({
    connect(token) {
      connections.push(token);
    },
  });
  return { ui, connections, ...dom };
}

function authToken(label) {
  return {
    accessToken: `${label}-access`,
    refreshToken: `${label}-refresh`,
  };
}

async function verifyLogoutRejectsLateRestore(LoginUI, authApi) {
  resetHarness(authApi.clearStoredTokens);
  const harness = createLoginHarness(LoginUI);
  authApi.storeTokens(authToken('old'));

  const restoring = harness.ui.restoreSession();
  await waitForRequests(1, '自动恢复请求未发出');
  assert.match(pendingRequests[0].url, /\/api\/auth\/refresh$/, '首个请求必须是 refresh');

  harness.ui.logout('已退出');
  respond(pendingRequests[0], authToken('late-restore'));

  assert.equal(await restoring, false, '已退出的旧 refresh 不得恢复会话');
  assert.equal(authApi.getAccessToken(), null, '迟到 refresh 不得写回 access token');
  assert.equal(authApi.getRefreshToken(), null, '迟到 refresh 不得写回 refresh token');
  assert.deepEqual(harness.connections, [], '迟到 refresh 不得建立 socket 连接');
  assert.equal(harness.elements['login-overlay'].classList.contains('hidden'), false, '迟到 refresh 不得隐藏登录层');
}

async function verifyManualLoginSupersedesRestore(LoginUI, authApi) {
  resetHarness(authApi.clearStoredTokens);
  const harness = createLoginHarness(LoginUI);
  authApi.storeTokens(authToken('old'));

  const restoring = harness.ui.restoreSession();
  await waitForRequests(1, '自动恢复请求未发出');
  harness.elements['input-login-name'].value = 'auth-proof';
  harness.elements['input-password'].value = 'auth-proof-password';
  harness.elements['btn-auth-submit'].dispatch('click');
  await waitForRequests(2, '手动登录请求未发出');
  assert.match(pendingRequests[1].url, /\/api\/auth\/login$/, '第二个请求必须是手动登录');

  respond(pendingRequests[1], authToken('manual'));
  await waitFor(() => authApi.getAccessToken() === 'manual-access', '手动登录未写入新 token');
  respond(pendingRequests[0], authToken('late-restore'));
  assert.equal(await restoring, false, '较早 refresh 不得覆盖手动登录');

  assert.equal(authApi.getAccessToken(), 'manual-access', '手动登录 token 不得被旧 refresh 覆盖');
  assert.equal(authApi.getRefreshToken(), 'manual-refresh', '手动登录 refresh token 不得被旧 refresh 覆盖');
  assert.deepEqual(harness.connections, ['manual-access'], '只有最新手动登录可以建立连接');
}

async function verifyLatestLoginWins(LoginUI, authApi) {
  resetHarness(authApi.clearStoredTokens);
  const harness = createLoginHarness(LoginUI);
  harness.elements['input-login-name'].value = 'auth-proof';
  harness.elements['input-password'].value = 'auth-proof-password';

  harness.elements['btn-auth-submit'].dispatch('click');
  harness.elements['btn-auth-submit'].dispatch('click');
  await waitForRequests(2, '连续登录请求未全部发出');

  respond(pendingRequests[1], authToken('latest-login'));
  await waitFor(() => authApi.getAccessToken() === 'latest-login-access', '最新登录未生效');
  respond(pendingRequests[0], authToken('stale-login'));
  await settleAsyncWork();

  assert.equal(authApi.getAccessToken(), 'latest-login-access', '旧登录不得覆盖最新登录 token');
  assert.deepEqual(harness.connections, ['latest-login-access'], '旧登录不得重复建立连接');
}

async function verifyLogoutRejectsLateRegister(LoginUI, authApi) {
  resetHarness(authApi.clearStoredTokens);
  const harness = createLoginHarness(LoginUI);
  harness.elements['tab-register'].dispatch('click');
  harness.elements['input-account-name'].value = 'auth-proof-account';
  harness.elements['input-password'].value = 'auth-proof-password';
  harness.elements['input-role-name'].value = '认证演练';
  harness.elements['input-display-name'].value = '甲';
  harness.elements['btn-auth-submit'].dispatch('click');
  await waitForRequests(1, '注册前的显示名称检查未发出');
  assert.match(pendingRequests[0].url, /\/display-name\/check\?/, '注册必须先检查显示名称');

  respond(pendingRequests[0], { available: true });
  await waitForRequests(2, '注册请求未发出');
  assert.match(pendingRequests[1].url, /\/api\/auth\/register$/, '第二个请求必须是注册');

  harness.ui.logout('已退出');
  respond(pendingRequests[1], authToken('late-register'));
  await settleAsyncWork();

  assert.equal(authApi.getAccessToken(), null, '迟到注册不得写入 access token');
  assert.equal(authApi.getRefreshToken(), null, '迟到注册不得写入 refresh token');
  assert.deepEqual(harness.connections, [], '迟到注册不得建立 socket 连接');
  assert.equal(harness.elements['login-overlay'].classList.contains('hidden'), false, '迟到注册不得隐藏登录层');
}

const vite = await createServer({
  root: clientRoot,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

try {
  const { LoginUI } = await vite.ssrLoadModule('/src/ui/login.ts');
  const authApi = await vite.ssrLoadModule('/src/ui/auth-api.ts');
  await verifyLogoutRejectsLateRestore(LoginUI, authApi);
  await verifyManualLoginSupersedesRestore(LoginUI, authApi);
  await verifyLatestLoginWins(LoginUI, authApi);
  await verifyLogoutRejectsLateRegister(LoginUI, authApi);
  console.log('LoginUI 认证代际与迟到回包隔离验证通过');
} finally {
  await vite.close();
}
