const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(clientRoot, 'src');
/**
 * read：执行核心业务逻辑。
 * @param relativePath 参数说明。
 * @returns 函数返回值。
 */
/**
 * read：执行核心业务逻辑。
 * @param relativePath 参数说明。
 * @returns 函数返回值。
 */


function read(relativePath) {
  return fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');
}
/**
 * lineCount：执行核心业务逻辑。
 * @param relativePath 参数说明。
 * @returns 函数返回值。
 */
/**
 * lineCount：执行核心业务逻辑。
 * @param relativePath 参数说明。
 * @returns 函数返回值。
 */


function lineCount(relativePath) {
  const content = read(relativePath);
  const newlineMatches = content.match(/\n/g);
  return newlineMatches ? newlineMatches.length : 0;
}
/**
 * assert：执行核心业务逻辑。
 * @param condition 参数说明。
 * @param message 参数说明。
 * @returns 函数返回值。
 */
/**
 * assert：执行核心业务逻辑。
 * @param condition 参数说明。
 * @param message 参数说明。
 * @returns 函数返回值。
 */


function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
/**
 * assertMissing：执行核心业务逻辑。
 * @param content 参数说明。
 * @param pattern 参数说明。
 * @param message 参数说明。
 * @returns 函数返回值。
 */
/**
 * assertMissing：执行核心业务逻辑。
 * @param content 参数说明。
 * @param pattern 参数说明。
 * @param message 参数说明。
 * @returns 函数返回值。
 */


function assertMissing(content, pattern, message) {
  assert(!pattern.test(content), message);
}
/**
 * assertIncludes：执行核心业务逻辑。
 * @param content 参数说明。
 * @param pattern 参数说明。
 * @param message 参数说明。
 * @returns 函数返回值。
 */
/**
 * assertIncludes：执行核心业务逻辑。
 * @param content 参数说明。
 * @param pattern 参数说明。
 * @param message 参数说明。
 * @returns 函数返回值。
 */


function assertIncludes(content, pattern, message) {
  assert(pattern.test(content), message);
}
/**
 * main：执行核心业务逻辑。
 * @returns 函数返回值。
 */
/**
 * main：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
// 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const mainTs = read('src/main.ts');
  const compositionTs = read('src/main-app-composition.ts');
  const runtimeAssemblyTs = read('src/main-app-runtime-assembly.ts');
  const runtimeContextTs = read('src/main-app-runtime-context.ts');
  const panelContextTs = read('src/main-app-panel-context.ts');
  const runtimeOwnerContextTs = read('src/main-app-runtime-owner-context.ts');
  const socketTs = read('src/network/socket.ts');

  const mainLineCount = lineCount('src/main.ts');
  const compositionLineCount = lineCount('src/main-app-composition.ts');
  const runtimeAssemblyLineCount = lineCount('src/main-app-runtime-assembly.ts');
  const runtimeContextLineCount = lineCount('src/main-app-runtime-context.ts');
  const panelContextLineCount = lineCount('src/main-app-panel-context.ts');
  const runtimeOwnerContextLineCount = lineCount('src/main-app-runtime-owner-context.ts');
  const socketLineCount = lineCount('src/network/socket.ts');

  assert(mainLineCount <= 850, `main.ts 行数超标：${mainLineCount} > 850`);
  assert(compositionLineCount <= 80, `main-app-composition.ts 行数超标：${compositionLineCount} > 80`);
  assert(runtimeAssemblyLineCount <= 80, `main-app-runtime-assembly.ts 行数超标：${runtimeAssemblyLineCount} > 80`);
  assert(runtimeContextLineCount <= 220, `main-app-runtime-context.ts 行数超标：${runtimeContextLineCount} > 220`);
  assert(panelContextLineCount <= 320, `main-app-panel-context.ts 行数超标：${panelContextLineCount} > 320`);
  assert(runtimeOwnerContextLineCount <= 450, `main-app-runtime-owner-context.ts 行数超标：${runtimeOwnerContextLineCount} > 450`);
  assert(socketLineCount <= 700, `socket.ts 行数超标：${socketLineCount} > 700`);

  assertIncludes(
    mainTs,
    /initializeMainApp\(/,
    'main.ts 必须通过 initializeMainApp 收口应用入口装配',
  );
  assertMissing(mainTs, /@mud\/shared/, 'main.ts 不应继续直接依赖共享协议类型');
  assertMissing(
    mainTs,
    /createMain[A-Z]\w+(StateSource|BridgeSource)\(/,
    'main.ts 不应继续直接装配状态源或 runtime bridge owner',
  );
  assertMissing(mainTs, /getElementById\(/, 'main.ts 不应继续直接查询 DOM');
  assertMissing(mainTs, /new SocketManager\(/, 'main.ts 不应继续直接创建 SocketManager');
  assertMissing(mainTs, /createMapRuntime\(/, 'main.ts 不应继续直接创建地图运行时');
  assertMissing(mainTs, /createClientPanelSystem\(/, 'main.ts 不应继续直接创建 panelSystem');
  assertMissing(mainTs, /\bsocket\.on\(/, 'main.ts 不应直接监听 socket.on(...)');
  assertMissing(mainTs, /\bsocket\.onKick\(/, 'main.ts 不应直接监听 socket.onKick(...)');
  assertMissing(mainTs, /\bsocket\.onConnectError\(/, 'main.ts 不应直接监听 socket.onConnectError(...)');
  assertMissing(mainTs, /\bsocket\.onDisconnect\(/, 'main.ts 不应直接监听 socket.onDisconnect(...)');
  assertMissing(mainTs, /bindMainHighFrequencySocketEvents\(/, 'main.ts 不应继续直接绑定高频 socket 事件');
  assertMissing(mainTs, /bindMainLowFrequencySocketEvents\(/, 'main.ts 不应继续直接绑定低频 socket 事件');
  assertMissing(mainTs, /bindMainShellInteractions\(/, 'main.ts 不应继续直接绑定 shell 交互');
  assertMissing(mainTs, /bindMainMapInteractions\(/, 'main.ts 不应继续直接绑定地图交互');
  assertMissing(mainTs, /bindMainStartup\(/, 'main.ts 不应继续直接绑定启动期 wiring');

  assertIncludes(compositionTs, /scheduleDeferredLocalContentPreload\(/, 'main-app-composition.ts 必须继续承接预加载入口');
  assertIncludes(compositionTs, /assembleMainApp\(/, 'main-app-composition.ts 必须把前台主链装配委托给 assembleMainApp');
  assertMissing(compositionTs, /createMain[A-Z]\w+\(/, 'main-app-composition.ts 不应直接装配各状态源');
  assertMissing(compositionTs, /bootstrapMainApp\(/, 'main-app-composition.ts 不应直接调用 bootstrapMainApp');

  assertIncludes(runtimeAssemblyTs, /createMainAppRuntimeContext\(/, 'main-app-runtime-assembly.ts 必须继续委托 runtime context 构造');
  assertIncludes(runtimeAssemblyTs, /runMainAppBootstrap\(/, 'main-app-runtime-assembly.ts 必须继续委托最终 bootstrap runner');
  assertIncludes(runtimeContextTs, /createMainPanelContext\(/, 'main-app-runtime-context.ts 必须继续委托 panel context 装配');
  assertIncludes(runtimeContextTs, /createMainRuntimeOwnerContext\(/, 'main-app-runtime-context.ts 必须继续委托 runtime owner context 装配');
  assertMissing(runtimeContextTs, /createMainRuntimeStateSource\(/, 'main-app-runtime-context.ts 不应继续直接装配 runtime state owner');
  assertMissing(runtimeContextTs, /createMainPanelDeltaStateSource\(/, 'main-app-runtime-context.ts 不应继续直接装配 panel delta owner');
  assertMissing(runtimeContextTs, /createMainMapRuntimeBridgeSource\(/, 'main-app-runtime-context.ts 不应继续直接装配地图 runtime bridge owner');
  assertIncludes(panelContextTs, /createMainActionStateSource\(/, 'main-app-panel-context.ts 必须继续承接 panel\/cold-path owner 装配');
  assertIncludes(panelContextTs, /createMainSettingsStateSource\(/, 'main-app-panel-context.ts 必须继续承接 settings owner 装配');
  assertIncludes(runtimeOwnerContextTs, /createMainRuntimeStateSource\(/, 'main-app-runtime-owner-context.ts 必须继续承接 runtime owner 装配');
  assertIncludes(runtimeOwnerContextTs, /createMainRuntimeDeltaStateSource\(/, 'main-app-runtime-owner-context.ts 必须继续承接高频 delta owner 装配');
  assertIncludes(runtimeOwnerContextTs, /createMainPanelDeltaStateSource\(/, 'main-app-runtime-owner-context.ts 必须继续承接 panel delta owner 装配');
  assertIncludes(runtimeOwnerContextTs, /createMainMapRuntimeBridgeSource\(/, 'main-app-runtime-owner-context.ts 必须继续承接地图 runtime bridge owner 装配');
  assertMissing(panelContextTs, /socket\.on\(/, 'main-app-panel-context.ts 不应直接消费 socket.on(...)');
  assertMissing(runtimeOwnerContextTs, /socket\.on\(/, 'main-app-runtime-owner-context.ts 不应直接消费 socket.on(...)');
  assertMissing(panelContextTs, /legacy\//, 'main-app-panel-context.ts 不应继续依赖 legacy 入口');
  assertMissing(runtimeOwnerContextTs, /legacy\//, 'main-app-runtime-owner-context.ts 不应继续依赖 legacy 入口');
  assertMissing(panelContextTs, /\bcompat\b/i, 'main-app-panel-context.ts 不应继续依赖 compat 逻辑');
  assertMissing(runtimeOwnerContextTs, /\bcompat\b/i, 'main-app-runtime-owner-context.ts 不应继续依赖 compat 逻辑');

  assertIncludes(socketTs, /createSocketRuntimeSender/, 'socket.ts 必须继续通过 runtime sender owner 收口发送面');
  assertIncludes(socketTs, /createSocketPanelSender/, 'socket.ts 必须继续通过 panel sender owner 收口发送面');
  assertIncludes(socketTs, /createSocketSocialEconomySender/, 'socket.ts 必须继续通过 social\/economy sender owner 收口发送面');
  assertIncludes(socketTs, /createSocketAdminSender/, 'socket.ts 必须继续通过 admin sender owner 收口发送面');
  assertIncludes(socketTs, /on<TEvent extends BoundServerEventName>/, 'socket.ts 必须保留泛型 on(...) 事件消费入口');

  const gmFiles = [
    'src/gm.ts',
    'src/gm-map-editor.ts',
    'src/gm-world-viewer.ts',
    'src/ui/panels/gm-panel.ts',
  ];
  for (const file of gmFiles) {
    assert(fs.existsSync(path.join(clientRoot, file)), `缺少 GM 工具文件：${file}`);
  }

  assertMissing(mainTs, /from ['"]\.\/gm/, 'main.ts 不应直接依赖 GM 工具入口');
  assertMissing(mainTs, /from ['"]\.\/gm-map-editor/, 'main.ts 不应直接依赖地图编辑器入口');
  assertMissing(mainTs, /from ['"]\.\/gm-world-viewer/, 'main.ts 不应直接依赖 GM 世界查看器入口');

  console.log(
    [
      'client mainline boundary check passed',
      `main.ts=${mainLineCount}`,
      `socket.ts=${socketLineCount}`,
      'gm toolchain retained as isolated tooling',
    ].join('\n'),
  );
}

main();
