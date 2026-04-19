#!/usr/bin/env node
'use strict';

async function probeShadowTarget(url) {
  if (!url) {
    return {
      ok: false,
      reason: 'shadow_url_missing',
    };
  }
  try {
    const healthResponse = await fetch(`${url}/health`);
    const healthText = await healthResponse.text();
    let healthPayload = null;
    try {
      healthPayload = JSON.parse(healthText);
    } catch {
      healthPayload = null;
    }
    const gmStateResponse = await fetch(`${url}/api/gm/state`);
    const alive = isShadowHealthAlive(healthPayload);
    if (!alive) {
      return {
        ok: false,
        reason: `health_unexpected_${healthResponse.status}`,
        healthPayload,
      };
    }
    if (gmStateResponse.status === 404) {
      return {
        ok: false,
        reason: 'gm_route_missing',
        healthPayload,
      };
    }
    return {
      ok: true,
      reason: healthResponse.ok ? 'reachable' : `reachable_with_nonready_health_${healthResponse.status}`,
      healthPayload,
      gmStateStatus: gmStateResponse.status,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `probe_failed:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function isShadowHealthAlive(payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  return payload?.ok === true
    || payload?.alive?.ok === true
    || payload?.status === 'ok';
}

module.exports = {
  probeShadowTarget,
};
