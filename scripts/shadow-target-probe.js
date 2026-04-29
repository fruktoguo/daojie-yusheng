#!/usr/bin/env node
'use strict';

async function probeShadowTarget(url, options = {}) {
  const gmPassword = typeof options?.gmPassword === 'string' ? options.gmPassword.trim() : '';
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
    const gmStateResponse = gmPassword
      ? await fetchAuthedGmState(url, gmPassword)
      : await fetch(`${url}/api/gm/state`);
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
    if (gmPassword) {
      const gmStateText = await gmStateResponse.text();
      const gmStatePayload = safeParseJson(gmStateText);
      if (!gmStateResponse.ok) {
        return {
          ok: false,
          reason: `gm_state_http_${gmStateResponse.status}`,
          healthPayload,
          gmStateStatus: gmStateResponse.status,
          gmStatePayload,
        };
      }
      if (!isValidGmStatePayload(gmStatePayload)) {
        return {
          ok: false,
          reason: 'gm_state_shape_invalid',
          healthPayload,
          gmStateStatus: gmStateResponse.status,
          gmStatePayload,
        };
      }
      return {
        ok: true,
        reason: healthResponse.ok ? 'reachable' : `reachable_with_nonready_health_${healthResponse.status}`,
        healthPayload,
        gmStateStatus: gmStateResponse.status,
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

async function fetchAuthedGmState(url, gmPassword) {
  const loginResponse = await fetch(`${url}/api/auth/gm/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ password: gmPassword }),
  });
  const loginText = await loginResponse.text();
  const loginPayload = safeParseJson(loginText);
  const accessToken = typeof loginPayload?.accessToken === 'string' ? loginPayload.accessToken.trim() : '';
  if (!loginResponse.ok || !accessToken) {
    return new Response(loginText || JSON.stringify(loginPayload ?? null), {
      status: loginResponse.ok ? 500 : loginResponse.status,
      headers: {
        'content-type': 'application/json',
      },
    });
  }
  return fetch(`${url}/api/gm/state`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

function safeParseJson(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
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

function isValidGmStatePayload(payload) {
  return Array.isArray(payload?.players)
    && Array.isArray(payload?.mapIds)
    && Number.isFinite(payload?.botCount)
    && Number.isFinite(payload?.playerPage?.page)
    && Number.isFinite(payload?.playerPage?.pageSize)
    && Number.isFinite(payload?.playerPage?.total)
    && Number.isFinite(payload?.playerPage?.totalPages)
    && typeof payload?.playerPage?.keyword === 'string'
    && typeof payload?.playerPage?.sort === 'string'
    && Number.isFinite(payload?.playerStats?.totalPlayers)
    && Number.isFinite(payload?.playerStats?.onlinePlayers)
    && Number.isFinite(payload?.playerStats?.offlineHangingPlayers)
    && Number.isFinite(payload?.playerStats?.offlinePlayers)
    && payload?.perf
    && typeof payload.perf === 'object';
}

module.exports = {
  probeShadowTarget,
};
