import assert from 'node:assert/strict';

import {
  DEFAULT_LOCAL_SERVER_PORT,
  parseWindowsExcludedPortRanges,
  resolveLocalServerPort,
  WINDOWS_EXCLUDED_PORT_FALLBACK,
} from './resolve-local-server-port.mjs';

const ranges = parseWindowsExcludedPortRanges([
  'Start Port    End Port',
  '----------    --------',
  '      2915        3014',
  '     50000       50010     *',
].join('\n'));
assert.deepEqual(ranges, [
  { start: 2915, end: 3014, managed: false },
  { start: 50000, end: 50010, managed: true },
]);

assert.deepEqual(resolveLocalServerPort('3000', ranges), {
  requestedPort: 3000,
  port: WINDOWS_EXCLUDED_PORT_FALLBACK,
  blockedRange: { start: 2915, end: 3014, managed: false },
});
assert.deepEqual(resolveLocalServerPort('14000', ranges), {
  requestedPort: 14000,
  port: 14000,
  blockedRange: null,
});
assert.equal(resolveLocalServerPort('invalid', ranges).port, DEFAULT_LOCAL_SERVER_PORT);
assert.equal(resolveLocalServerPort('3000', [
  { start: 2915, end: 3014, managed: false },
  { start: WINDOWS_EXCLUDED_PORT_FALLBACK, end: WINDOWS_EXCLUDED_PORT_FALLBACK, managed: false },
]).port, DEFAULT_LOCAL_SERVER_PORT);
assert.equal(resolveLocalServerPort('3000', [
  { start: 2915, end: 3014, managed: false },
  { start: DEFAULT_LOCAL_SERVER_PORT, end: DEFAULT_LOCAL_SERVER_PORT, managed: false },
  { start: WINDOWS_EXCLUDED_PORT_FALLBACK, end: WINDOWS_EXCLUDED_PORT_FALLBACK, managed: false },
]).port, WINDOWS_EXCLUDED_PORT_FALLBACK + 1);

console.log('[resolve-local-server-port-smoke] ok');
