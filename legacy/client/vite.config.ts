import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import path from 'path';

/** createBuildVersionPlugin：创建并返回用于构建版本信息的插件对象。 */
function createBuildVersionPlugin(buildId: string, builtAt: string): Plugin {
  return {
    name: 'mud-client-build-version',
    apply: 'build',
    /** generateBundle：写入版本信息资源文件。 */
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
  const clientInputs: Record<string, string> = {
    main: path.resolve(__dirname, 'index.html'),
    gm: path.resolve(__dirname, 'gm.html'),
  };
  const gmV2Entry = path.resolve(__dirname, 'gm-v2.html');

  if (existsSync(gmV2Entry)) {
    clientInputs['gm-v2'] = gmV2Entry;
  }

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
        input: clientInputs,
        output: {
          /** manualChunks：按模块路径拆分打包入口。 */
          manualChunks(id) {
            if (id.includes('/node_modules/')) {
              return 'vendor';
            }
            if (id.includes('/legacy/shared/src/')) {
              return 'shared';
            }
            if (id.includes('/legacy/client/src/ui/panels/')) {
              return 'main-panels';
            }
            if (id.includes('/src/constants/world/editor-catalog.generated.json')) {
              return 'world-editor-catalog';
            }
            if (id.includes('/src/constants/world/item-sources.generated.json')) {
              return 'world-item-sources';
            }
            if (id.includes('/src/constants/world/monster-locations.generated.json')) {
              return 'world-monster-locations';
            }
            return undefined;
          },
        },
      },
    },
    server: proxyTarget
      ? {
          proxy: {
            '/auth': proxyTarget,
            '/account': proxyTarget,
            '/gm/': proxyTarget,
            '/integrations/': proxyTarget,
            '/socket.io': {
              target: proxyTarget,
              ws: true,
            },
          },
        }
      : undefined,
  };
});
