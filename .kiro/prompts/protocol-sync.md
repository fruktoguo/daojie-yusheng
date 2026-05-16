# 协议改动三端联动检查

本次改动涉及 `packages/shared` 协议、跨端类型或 socket 包结构。请按下列清单逐项核查并跑门禁。

## 必查项

### 1. `packages/shared/src`
- 协议常量、`*-types.ts`、`protocol*.ts`、`network-protobuf*` 是否同步更新。
- 是否新增字段；字段属于哪一层（首包 / 静态 / 低频 / 按需详情 / 高频动态）。
- 字段生命周期、可选性、默认值是否定义清楚。
- 是否避免在 `client` / `server` 两侧复制分散协议常量或临时私有类型。

### 2. `packages/server`
- 发包侧：`network/**`、`runtime/**` 中相应的广播 / 单播 / AOI 是否对齐新协议。
- 消费侧：socket handler 仍只接意图、鉴权、排队、回包，**不直接改权威世界态**。
- 高频包不混入：静态资源、长文本说明、完整详情、完整面板数据、地图全量静态、低频不变字段。
- 能发 `id / revision / enum / patch / add / remove` 就不发完整对象；能单播就不 AOI，能 AOI 就不全图。

### 3. `packages/client`
- 消费：`network/**`、`runtime/**`、`game-map/**` 是否解析新字段。
- UI 投影：`ui/**`、`react-ui/**`、`renderer/**` 是否按新结构更新；是否走局部 patch 而非整面板重建。
- 是否避免每帧全量解析、是否避免用正则解析纯文本来还原结构化信息（违反通知消息规范）。

### 4. protobuf / envelope 编解码边界
- 编码与解码字段顺序、可选标记、默认值一致。
- 旧 client × 新 server、新 client × 旧 server 两个方向都不会崩溃路径。
- protobuf drift：`pnpm proof:protobuf-drift`。

## 必跑门禁

- `pnpm build:shared`
- `pnpm audit:protocol`
- `pnpm proof:protocol-source`
- `pnpm proof:shared-types-source`
- 涉及客户端消费：`pnpm verify:client`
- 涉及服务端发包：`pnpm verify:quick`

## 输出要求

按"必查项"四节逐项给结论（OK / 需要补 / 不适用），把对应文件路径列出。最后报告所有命令的退出码与关键输出；任一不过即停下来定位。
