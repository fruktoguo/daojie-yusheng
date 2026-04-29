/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;

/** Vite 注入到 `import.meta.env` 的客户端环境变量。 */
interface ImportMetaEnv {
/**
 * VITE_DEBUG_MOVEMENT：VITEDEBUGMOVEMENT相关字段。
 */

  readonly VITE_DEBUG_MOVEMENT?: string;
}

/** 扩展 `import.meta` 类型，补上项目自己的环境变量字段。 */
interface ImportMeta {
  /** Vite 提供的运行时环境变量集合。 */
  readonly env: ImportMetaEnv;
}
