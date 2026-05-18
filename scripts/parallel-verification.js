/**
 * 并行验证步骤运行器。
 * 把无依赖的验证步骤改为 Promise.all + spawn 并发执行。
 * 通过 --parallel 开关启用，默认仍走串行路径。
 */
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

/**
 * 并行执行一组验证步骤。
 * @param {Array<{label: string, command?: string, args: string[], env?: object, shell?: boolean}>} steps
 * @param {object} options
 * @param {string} options.cwd
 * @param {object} options.env
 * @returns {Promise<Array<{label: string, durationMs: number, status: number, error?: string}>>}
 */
async function runStepsParallel(steps, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const baseEnv = options.env ?? process.env;

  const promises = steps.map((step) => {
    return new Promise((resolve) => {
      const command = step.command ?? 'pnpm';
      const startedAt = Date.now();
      const stdout = [];
      const stderr = [];

      const child = spawn(command, step.args, {
        cwd,
        shell: step.shell ?? (command === 'pnpm' && process.platform === 'win32'),
        env: { ...baseEnv, ...(step.env ?? null) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk) => stdout.push(chunk));
      child.stderr.on('data', (chunk) => stderr.push(chunk));

      child.on('error', (err) => {
        resolve({
          label: step.label,
          durationMs: Date.now() - startedAt,
          status: 1,
          error: err.message,
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        });
      });

      child.on('close', (code) => {
        resolve({
          label: step.label,
          durationMs: Date.now() - startedAt,
          status: code ?? 0,
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        });
      });
    });
  });

  return Promise.all(promises);
}

/**
 * 将步骤列表分为可并行组和必须串行的步骤。
 * 碰库的步骤（label 含 'db'/'database'/'persistence'）必须串行。
 * @param {Array} steps
 * @returns {{ parallel: Array, serial: Array }}
 */
function partitionSteps(steps) {
  const serial = [];
  const parallel = [];
  const dbKeywords = ['db', 'database', 'persistence', 'shadow', 'destructive'];

  for (const step of steps) {
    const labelLower = (step.label ?? '').toLowerCase();
    const needsSerial = dbKeywords.some((kw) => labelLower.includes(kw))
      || step.serial === true;
    if (needsSerial) {
      serial.push(step);
    } else {
      parallel.push(step);
    }
  }

  return { parallel, serial };
}

module.exports = { runStepsParallel, partitionSteps };
