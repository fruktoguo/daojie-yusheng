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
