import { createHash } from 'node:crypto';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import path from 'path';

function createBuildVersionPlugin(buildId: string, builtAt: string): Plugin {
  return {
    name: 'mud-client-build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(
          {
            buildId,
            builtAt,
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim();
  const builtAt = new Date().toISOString();
  const buildId = createHash('sha1').update(`${mode}:${builtAt}`).digest('hex').slice(0, 12);

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [createBuildVersionPlugin(buildId, builtAt)],
    resolve: {
      alias: {
        '@mud/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          gm: path.resolve(__dirname, 'gm.html'),
        },
      },
    },
    server: proxyTarget
      ? {
          proxy: {
            '/auth': proxyTarget,
            '/account': proxyTarget,
            '/gm/': proxyTarget,
            '/socket.io': {
              target: proxyTarget,
              ws: true,
            },
          },
        }
      : undefined,
  };
});
