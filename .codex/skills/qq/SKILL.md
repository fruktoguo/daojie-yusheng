---
name: qq
description: 通过 NapCat 的 OneBot HTTP API，只读采集白名单内指定 QQ 玩家群的群资料、成员列表与历史消息，输出本地 JSON 快照，并依据图文、回复和相邻消息渐进下载关键图片供直接视觉读取。用于玩家社群调研、群聊反馈整理、活跃度分析、指定群消息回溯、关键截图核对，或排查 NapCat 群消息采集配置；缺少 `.env`、OneBot HTTP 未启用或群号未授权时先引导安全配置，禁止绕过白名单、全群发现、默认全量下载图片或使用 OCR。
---

# QQ 玩家群信息采集

通过 `scripts/qq.py` 调用 NapCat OneBot HTTP API。保持只读，只访问 `.env` 中显式列出的群号，不发送消息、不修改群成员或群设置。

## 执行流程

1. 将本文件所在目录记为 `SKILL_DIR`。
2. 检查 `SKILL_DIR/.env`。若不存在，停止采集并引导开发者：

   ```bash
   cp "$SKILL_DIR/.env.example" "$SKILL_DIR/.env"
   chmod 600 "$SKILL_DIR/.env"
   ```

   要求至少填写 `NAPCAT_HTTP_URL` 和 `NAPCAT_GROUP_IDS`；OneBot HTTP 配置了 token 时，同时填写 `NAPCAT_ACCESS_TOKEN`。不要猜测群号、端口或 token。
3. 首次配置、配置变化或连接异常时，阅读 `references/configuration.md`，再执行连接检查：

   ```bash
   python3 "$SKILL_DIR/scripts/qq.py" check
   ```

4. 检查通过后再采集。默认采集 `.env` 白名单中的全部群：

   ```bash
   python3 "$SKILL_DIR/scripts/qq.py" collect
   ```

5. 只采集白名单中的部分群时，重复传入 `--group-id`：

   ```bash
   python3 "$SKILL_DIR/scripts/qq.py" collect \
     --group-id 100000001 \
     --days 1 \
     --limit 500
   ```

6. 根据用户明确要求读取生成的 JSON。默认输出位于 `SKILL_DIR/.runtime/collections/`，终端只显示数量和文件路径，不显示消息正文。
7. 需要理解截图时，先为快照生成脱敏候选索引：

   ```bash
   python3 "$SKILL_DIR/scripts/qq.py" index-images \
     --snapshot "$SNAPSHOT" \
     --context 2
   ```

   读取生成的候选索引，结合图片所在消息的文字、回复目标、前后消息和同一问题的重复反馈判断优先级。优先选择明确描述报错、白屏、错位、数值异常或操作失败的图文；纯表情、梗图和无关展示默认降级。不要只按关键词或图片尺寸决定重要性。
8. 每次只选 1～3 条高置信消息下载图片：

   ```bash
   python3 "$SKILL_DIR/scripts/qq.py" fetch-images \
     --snapshot "$SNAPSHOT" \
     --message-ref 0:250
   ```

   对命令返回的本地图片逐张使用 `view_image` 直接视觉读取，不调用 OCR、Tesseract、文字识别 API 或外部图像分析服务。图片若只是反应表情、证据不足或与上下文不符，再沿同一反馈簇逐张扩展；证据足够后立即停止，不默认下载全部图片。

## 范围控制

- 将 `NAPCAT_GROUP_IDS` 视为唯一授权白名单。拒绝未列入其中的 `--group-id`，不要调用 `get_group_list` 扩大范围。
- 将 `NAPCAT_HTTP_URL` 视为 OneBot HTTP 地址，不要误用 NapCat WebUI 地址或 WebUI token。
- 当前 NapCat 若只有反向 WebSocket 客户端，先引导开发者新增 OneBot HTTP Server；不要自动修改 NapCat、Docker Compose、端口映射或鉴权配置。
- 默认仅连接回环地址。连接非本机地址必须同时配置 `NAPCAT_ALLOW_REMOTE=true` 和非空 token。
- 只使用 `get_login_info`、`get_group_info`、`get_group_member_list`、`get_group_msg_history` 四个只读 action。
- 图片只从白名单群历史消息已经返回的 `image` 段获取；下载器仅接受受信任 QQ/Tencent HTTPS 域名、限制重定向和单图大小，不接受任意外部 URL。
- 候选索引用成员代号替代 `sender`/`at` 身份字段，不写入图片 URL；必要消息正文仍只保存在本地 `0600` 文件中，下载结果与清单同样放在 `.runtime/`。
- 没有本地图片视觉查看能力时，停止图片分析并说明限制；禁止用 OCR 或把图片上传到其他服务代替。
- 不把 `.env`、token、群消息快照、成员资料写入日志、回复、提交或外部服务。
- 展示结果时遵循最小披露：优先汇总数量与趋势；只有用户明确指定时才引用必要消息，并隐藏无关成员身份。

## 常用参数

```text
check
  验证登录态及白名单群可访问性，不写采集文件。

collect
  --group-id ID       仅采集指定白名单群，可重复
  --since ISO_TIME    指定开始时间，优先于 --days
  --until ISO_TIME    指定结束时间，默认当前时间
  --days N            回溯天数
  --limit N           每群最多保留的历史消息数
  --no-members        不采集成员列表
  --no-messages       不采集历史消息
  --output PATH       指定单个 JSON 输出文件

index-images
  --snapshot PATH     `collect` 生成的 JSON 快照
  --context N         每侧附带的相邻消息数，默认 2，范围 `0..10`
  --output PATH       指定候选索引 JSON 输出文件

fetch-images
  --snapshot PATH     `collect` 生成的 JSON 快照
  --message-ref G:M   候选索引中的群索引和消息索引，可重复
  --include-emoji     同时下载动画表情；默认跳过
  --output-dir PATH   指定新的私密图片输出目录

全局
  --env-file PATH     改用其他配置文件；默认 SKILL_DIR/.env
```

## 异常处理

- 缺少 `.env` 或必填项：原样提供脚本给出的配置步骤，不自行创建含真实凭据的文件。
- `401` / `403`：要求核对 OneBot HTTP Server 的 access token；不要输出已配置 token。
- 连接拒绝：要求确认 NapCat 已启用 OneBot HTTP Server、监听地址和 Docker 端口映射。
- 群不可访问：确认机器人仍在群内、群号属于白名单且账号登录正常。
- 历史不足：说明结果受 QQ/NapCat 可回溯范围限制，不把缺失消息推断为“群内没有消息”。
- 图片域名被拒绝：不要放宽为任意域名；核对它是否确为 NapCat 返回的新 QQ/Tencent 媒体域名后再更新允许列表。
- 图片无法判断：不要改用 OCR；回到候选索引，按回复关系和相邻反馈一次补看一张。
