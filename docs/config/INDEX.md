# 配置文档索引

本目录说明各配置文件的用途、字段含义和修改注意事项。

## 服务端配置

| 配置 | 文档 | 说明 |
|------|------|------|
| 环境变量 | [server-env](server-env.md) | 数据库、Redis、GM、CORS 等 |
| 运行时配置 | [server-runtime-config](server-runtime-config.md) | tick 间隔、超时、灵气基准 |

## 客户端配置

| 配置 | 文档 | 说明 |
|------|------|------|
| 本地存储配置 | [client-config](client-config.md) | UI 样式、性能、缓存等 |

## 使用说明

- 新增配置说明时复制 `template.md`
- 配置文档描述"怎么改配置"，不是配置本身
- 修改配置前必须先读对应文档
