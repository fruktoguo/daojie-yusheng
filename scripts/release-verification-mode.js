/**
 * 本脚本属于仓库级运维或发布辅助工具，负责把常见检查、环境解析或发布步骤自动化。
 *
 * 维护时要让输入参数、环境变量和退出码含义明确，避免本地脚本在 CI 或生产发布中表现不一致。
 */
'use strict';

const { runVerificationSteps, runVerificationStepsParallel } = require('./verification-timing');

function isSerialReleaseVerification(argv = process.argv) {
  return argv.includes('--serial');
}

async function runReleaseVerificationSteps(options, argv = process.argv) {
  if (isSerialReleaseVerification(argv)) {
    return runVerificationSteps(options);
  }
  return runVerificationStepsParallel(options);
}

module.exports = {
  isSerialReleaseVerification,
  runReleaseVerificationSteps,
};
