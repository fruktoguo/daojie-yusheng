'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runStepsParallel, partitionSteps } = require('./parallel-verification');

const repoRoot = path.resolve(__dirname, '..');
const timingDir = path.join(repoRoot, '.runtime', 'verification-timings');

function createTiming(command, gate, options = {}) {
  return {
    command,
    gate,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    finishedAt: null,
    durationMs: 0,
    caseDurations: [],
    failedCase: null,
    environment: {
      dbEnabled: Boolean(options.dbEnabled),
      shadowEnabled: Boolean(options.shadowEnabled),
      destructiveEnabled: Boolean(options.destructiveEnabled),
    },
    git: readGitState(),
    steps: [],
  };
}

function runVerificationSteps(options) {
  const timing = createTiming(options.command, options.gate, options);
  const baseEnv = options.env ?? process.env;
  for (const step of options.steps) {
    const command = step.command ?? 'pnpm';
    const stepStartedAt = Date.now();
    process.stdout.write(`[${options.gate}] start step=${step.label}\n`);
    const result = spawnSync(command, step.args, {
      cwd: options.cwd ?? repoRoot,
      stdio: 'inherit',
      shell: step.shell ?? (command === 'pnpm' && process.platform === 'win32'),
      env: {
        ...baseEnv,
        ...(step.env ?? null),
      },
    });
    const stepRecord = {
      label: step.label,
      command,
      args: step.args,
      startedAt: new Date(stepStartedAt).toISOString(),
      durationMs: Date.now() - stepStartedAt,
      status: result.status ?? (result.error ? 1 : 0),
    };
    timing.steps.push(stepRecord);
    if (result.error) {
      stepRecord.error = result.error.message;
      timing.failedCase = step.label;
      finishTiming(timing);
      writeTiming(timing);
      throw result.error;
    }
    if (result.status !== 0) {
      timing.failedCase = step.label;
      finishTiming(timing);
      writeTiming(timing);
      process.stderr.write(`[${options.gate}] failed step=${step.label} status=${result.status ?? 1}\n`);
      return result.status ?? 1;
    }
    process.stdout.write(`[${options.gate}] done step=${step.label} durationMs=${stepRecord.durationMs}\n`);
  }
  finishTiming(timing);
  writeTiming(timing);
  process.stdout.write(`[${options.gate}] timing=${path.relative(repoRoot, path.join(timingDir, 'latest.json'))}\n`);
  return 0;
}

/**
 * 并行模式验证步骤运行器。
 * 无依赖步骤并发执行，碰库步骤串行执行。
 * @param {object} options 与 runVerificationSteps 相同的参数
 * @returns {Promise<number>} 退出码
 */
async function runVerificationStepsParallel(options) {
  const timing = createTiming(options.command, options.gate, options);
  const baseEnv = options.env ?? process.env;
  const cwd = options.cwd ?? repoRoot;

  const { parallel, serial } = partitionSteps(options.steps);

  // 先并行执行无依赖步骤
  if (parallel.length > 0) {
    process.stdout.write(`[${options.gate}] parallel: running ${parallel.length} steps concurrently\n`);
    const results = await runStepsParallel(parallel, { cwd, env: baseEnv });
    for (const result of results) {
      timing.steps.push({
        label: result.label,
        durationMs: result.durationMs,
        status: result.status,
        parallel: true,
      });
      if (result.status !== 0) {
        process.stderr.write(`[${options.gate}] parallel failed: ${result.label} (status=${result.status})\n`);
        if (result.stderr) process.stderr.write(result.stderr);
        timing.failedCase = result.label;
        finishTiming(timing);
        writeTiming(timing);
        return result.status;
      }
      process.stdout.write(`[${options.gate}] parallel done: ${result.label} (${result.durationMs}ms)\n`);
    }
  }

  // 再串行执行碰库步骤
  for (const step of serial) {
    const command = step.command ?? 'pnpm';
    const stepStartedAt = Date.now();
    process.stdout.write(`[${options.gate}] serial start: ${step.label}\n`);
    const result = spawnSync(command, step.args, {
      cwd,
      stdio: 'inherit',
      shell: step.shell ?? (command === 'pnpm' && process.platform === 'win32'),
      env: { ...baseEnv, ...(step.env ?? null) },
    });
    const stepRecord = {
      label: step.label,
      durationMs: Date.now() - stepStartedAt,
      status: result.status ?? (result.error ? 1 : 0),
      parallel: false,
    };
    timing.steps.push(stepRecord);
    if (result.error || result.status !== 0) {
      timing.failedCase = step.label;
      finishTiming(timing);
      writeTiming(timing);
      process.stderr.write(`[${options.gate}] serial failed: ${step.label}\n`);
      return result.status ?? 1;
    }
    process.stdout.write(`[${options.gate}] serial done: ${step.label} (${stepRecord.durationMs}ms)\n`);
  }

  finishTiming(timing);
  writeTiming(timing);
  process.stdout.write(`[${options.gate}] timing=${path.relative(repoRoot, path.join(timingDir, 'latest.json'))}\n`);
  return 0;
}

function finishTiming(timing) {
  timing.finishedAt = new Date().toISOString();
  timing.durationMs = Date.now() - timing.startedAtMs;
  delete timing.startedAtMs;
}

function writeTiming(timing) {
  fs.mkdirSync(timingDir, { recursive: true });
  fs.writeFileSync(path.join(timingDir, 'latest.json'), `${JSON.stringify(timing, null, 2)}\n`);
  fs.appendFileSync(path.join(timingDir, 'history.jsonl'), `${JSON.stringify(timing)}\n`);
}

function readGitState() {
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const dirty = spawnSync('git', ['status', '--short'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    commit: commit.status === 0 ? commit.stdout.trim() : null,
    dirty: dirty.status === 0 ? dirty.stdout.trim().length > 0 : null,
  };
}

module.exports = {
  runVerificationSteps,
  runVerificationStepsParallel,
  writeTiming,
};
