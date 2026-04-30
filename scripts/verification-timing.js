'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
  writeTiming,
};
