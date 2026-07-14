# NapCat OneBot HTTP 配置

仅在首次配置、连接异常或需要调整采集范围时阅读本文件。

## 1. 前置条件

NapCat 必须已登录 QQ，机器人账号必须位于目标群中，并启用一个可从运行 Skill 的主机访问的 OneBot HTTP Server。

反向 WebSocket 客户端只能把事件推送给它连接的服务，不能直接作为本脚本的 HTTP 调用入口。若当前仅配置 `websocketClients`，请由开发者在 NapCat WebUI 的 OneBot 网络配置中新增 HTTP Server。

Docker 场景建议：

- 容器内监听 `0.0.0.0:5700`。
- 主机端仅映射回环地址，例如 `127.0.0.1:5700:5700`。
- 为 OneBot HTTP Server 配置独立强 token。
- 修改 NapCat 或 Docker Compose 前先取得用户许可；本 Skill 不自动修改这些配置。

NapCat WebUI 端口与 WebUI token 不等于 OneBot HTTP 地址和 access token。

## 2. `.env` 字段

配置文件固定放在 Skill 根目录 `.env`，可从 `.env.example` 复制。脚本只解析已知的 `NAPCAT_*` 键值，不执行或 `source` 文件内容，也不使用宿主进程中的同名环境变量覆盖该文件，确保群号白名单以指定 `.env` 为唯一真源。

| 字段 | 必填 | 说明 |
|---|---:|---|
| `NAPCAT_HTTP_URL` | 是 | OneBot HTTP Server 根地址，如 `http://127.0.0.1:5700` |
| `NAPCAT_ACCESS_TOKEN` | 条件 | OneBot HTTP access token；非回环地址必须填写 |
| `NAPCAT_GROUP_IDS` | 是 | 可采集群号白名单，英文逗号分隔 |
| `NAPCAT_HISTORY_DAYS` | 否 | 默认回溯天数，范围 `1..90`，默认 `1` |
| `NAPCAT_HISTORY_LIMIT` | 否 | 每群消息上限，范围 `1..10000`，默认 `500` |
| `NAPCAT_COLLECT_MEMBER_LIST` | 否 | 是否采集成员列表，默认 `true` |
| `NAPCAT_COLLECT_MESSAGE_HISTORY` | 否 | 是否采集历史消息，默认 `true` |
| `NAPCAT_REQUEST_TIMEOUT_SECONDS` | 否 | 单次请求超时，范围 `1..120`，默认 `15` |
| `NAPCAT_REQUEST_INTERVAL_MS` | 否 | action 间隔，范围 `0..5000`，默认 `100` |
| `NAPCAT_OUTPUT_DIR` | 否 | 默认输出目录；相对路径按 Skill 目录解析 |
| `NAPCAT_ALLOW_REMOTE` | 否 | 是否允许非回环地址，默认 `false` |

非回环地址还必须使用 `https://`，避免 access token 和群数据在网络中明文传输。

不要把真实 `.env` 内容复制到聊天、日志、Issue 或 Git。完成配置后执行：

```bash
chmod 600 .env
python3 scripts/qq.py check
```

## 3. 采集内容

每次 `collect` 生成一个权限为 `0600` 的新 JSON 文件。若显式指定的文件已存在，脚本会拒绝覆盖。文件包含：

- 采集时间、时间范围与采集参数；
- `get_group_info` 返回的群资料；
- 可选的 `get_group_member_list` 成员列表；
- 可选的 `get_group_msg_history` 原始历史消息；
- 每群成员数、消息数及分页是否受限的摘要。

脚本不会保存 access token，也不会在终端打印消息正文或成员列表。

## 4. 关键图片读取

`index-images` 只从现有快照生成脱敏上下文索引，不联网。索引保留候选消息编号、成员代号、必要正文、回复目标和有限相邻消息，用代号替代 `sender`/`at` 身份字段，不保存图片 URL；正文仍按私密群资料处理。

`fetch-images` 只下载显式 `--message-ref` 选中的消息图片，单次最多选择 12 条消息，默认跳过动画表情，单图上限 32 MiB。下载仅允许 QQ/Tencent HTTPS 域名，并校验重定向目标和图片文件签名；结果目录与文件使用私密权限。

下载后使用本地 `view_image` 直接读取。禁止 OCR、批量文字识别、把图片上传到外部模型，或为了省事一次下载快照中的全部图片。

## 5. 常见错误

| 现象 | 处理 |
|---|---|
| 缺少 `.env` | 复制 `.env.example`，填写地址、白名单和 token |
| `Connection refused` | 检查 HTTP Server 是否启用、监听端口及 Docker 端口映射 |
| `401` / `403` | 核对 OneBot HTTP access token，不要使用 WebUI token |
| `404` | 确认 URL 指向 OneBot HTTP Server 根地址，而非 WebUI 或其他服务 |
| 群资料 action 失败 | 检查群号、机器人群成员身份和 QQ 登录态 |
| 历史消息少于预期 | QQ/NapCat 历史接口可能限制回溯深度；保留“结果可能不完整”的说明 |
| 图片来源域名被拒绝 | 核对是否为 NapCat 新返回的 QQ/Tencent 媒体域名，确认后精确扩充允许列表 |
| 图片只是表情或不能证明问题 | 回到候选索引，沿同一图文与回复上下文一次补看一张，不启用 OCR |
