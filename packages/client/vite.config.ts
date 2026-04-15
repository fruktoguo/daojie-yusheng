import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import path from 'path';

/** createBuildVersionPlugin：执行对应的业务逻辑。 */
function createBuildVersionPlugin(buildId: string, builtAt: string): Plugin {
  return {
    name: 'mud-client-build-version',
    apply: 'build',
/** generateBundle：处理当前场景中的对应操作。 */
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
/** env：定义该变量以承载业务值。 */
  const env = loadEnv(mode, __dirname, '');
/** proxyTarget：定义该变量以承载业务值。 */
  const proxyTarget = env.VITE_DEV_PROXY_TARGET?.trim();
/** builtAt：定义该变量以承载业务值。 */
  const builtAt = new Date().toISOString();
/** buildId：定义该变量以承载业务值。 */
  const buildId = createHash('sha1').update(`${mode}:${builtAt}`).digest('hex').slice(0, 12);
/** clientInputs：定义该变量以承载业务值。 */
  const clientInputs: Record<string, string> = {
    main: path.resolve(__dirname, 'index.html'),
    gm: path.resolve(__dirname, 'gm.html'),
  };
/** gmV2Entry：定义该变量以承载业务值。 */
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
        '@mud/shared-next': path.resolve(__dirname, '../shared/src'),
      },
    },
    build: {
      rollupOptions: {
        input: clientInputs,
        output: {
/** manualChunks：处理当前场景中的对应操作。 */
          manualChunks(id) {
            if (id.includes('/node_modules/')) {
              return 'vendor';
            }
            if (id.includes('/packages/shared/src/')) {
              return 'shared';
            }
            if (id.includes('/packages/client/src/ui/panels/')) {
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
            '/api/auth': proxyTarget,
            '/api/account': proxyTarget,
            '/api/gm': proxyTarget,
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
