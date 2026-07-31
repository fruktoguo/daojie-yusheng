/**
 * 服务端监听端点解析。
 *
 * 监听进程、监督探针必须共享同一端口口径，避免配置手误导致子进程无法启动、父进程却探测其他端口。
 */

export const DEFAULT_SERVER_LISTEN_HOST = '0.0.0.0';
export const DEFAULT_SERVER_LISTEN_PORT = 13_001;

export interface ServerListenEndpointResolution {
  host: string;
  port: number;
  /** 仅显式配置了非法端口时有值；未配置端口属于正常默认路径。 */
  invalidPortValue: string | null;
}

export interface ServerPublicPortResolution {
  port: number;
  invalidPortValue: string | null;
  invalidPortKey: 'SERVER_PUBLIC_PORT' | 'SERVER_PORT' | null;
}

/** 只接受 1..65535 的十进制整数；非法显式值回退到生产固定端口。 */
export function resolveServerListenEndpoint(
  env: NodeJS.ProcessEnv = process.env,
): ServerListenEndpointResolution {
  const host = typeof env.SERVER_HOST === 'string' && env.SERVER_HOST.trim()
    ? env.SERVER_HOST.trim()
    : DEFAULT_SERVER_LISTEN_HOST;
  const rawPort = typeof env.SERVER_PORT === 'string' ? env.SERVER_PORT.trim() : '';
  if (!rawPort) {
    return {
      host,
      port: DEFAULT_SERVER_LISTEN_PORT,
      invalidPortValue: null,
    };
  }

  const resolvedPort = resolveTcpPort(rawPort, DEFAULT_SERVER_LISTEN_PORT);

  return {
    host,
    ...resolvedPort,
  };
}

/** 公网端口优先使用显式配置；非法时回退实际监听端口，避免注册不可达端点。 */
export function resolveServerPublicPort(
  env: NodeJS.ProcessEnv = process.env,
): ServerPublicPortResolution {
  const listenEndpoint = resolveServerListenEndpoint(env);
  const rawPublicPort = typeof env.SERVER_PUBLIC_PORT === 'string'
    ? env.SERVER_PUBLIC_PORT.trim()
    : '';
  if (!rawPublicPort) {
    return {
      port: listenEndpoint.port,
      invalidPortValue: listenEndpoint.invalidPortValue,
      invalidPortKey: listenEndpoint.invalidPortValue === null ? null : 'SERVER_PORT',
    };
  }

  const resolved = resolveTcpPort(rawPublicPort, listenEndpoint.port);
  return {
    port: resolved.port,
    invalidPortValue: resolved.invalidPortValue,
    invalidPortKey: resolved.invalidPortValue === null ? null : 'SERVER_PUBLIC_PORT',
  };
}

function resolveTcpPort(rawPort: string, fallbackPort: number): Pick<ServerListenEndpointResolution, 'port' | 'invalidPortValue'> {
  const parsedPort = /^\d+$/u.test(rawPort) ? Number(rawPort) : Number.NaN;
  if (!Number.isSafeInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    return {
      port: fallbackPort,
      invalidPortValue: rawPort,
    };
  }
  return {
    port: parsedPort,
    invalidPortValue: null,
  };
}
