/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;

/** ImportMetaEnv：定义该接口的能力与字段约束。 */
interface ImportMetaEnv {
  readonly VITE_NEXT_DEBUG_MOVEMENT?: string;
}

/** ImportMeta：定义该接口的能力与字段约束。 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

