#!/usr/bin/env python3
"""只读采集白名单 QQ 群信息，并渐进提取关键反馈图片。"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = SKILL_DIR / ".env"
ENV_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
GROUP_ID_PATTERN = re.compile(r"^[1-9][0-9]{4,19}$")
MAX_HISTORY_DAYS = 90
MAX_HISTORY_LIMIT = 10_000
MAX_RESPONSE_BYTES = 64 * 1024 * 1024
MAX_HISTORY_PAGES_PER_GROUP = 200
MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024
MAX_IMAGE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 128 * 1024 * 1024
MAX_IMAGE_CONTEXT_MESSAGES = 10
MAX_SELECTED_MESSAGE_REFS = 12
MAX_SELECTED_IMAGES = 24
MESSAGE_REF_PATTERN = re.compile(r"^(?P<group_index>[0-9]+):(?P<message_index>[0-9]+)$")
ALLOWED_IMAGE_HOST_SUFFIXES = (
    "qpic.cn",
    "qq.com",
    "qq.com.cn",
)
KNOWN_CONFIG_KEYS = {
    "NAPCAT_HTTP_URL",
    "NAPCAT_ACCESS_TOKEN",
    "NAPCAT_GROUP_IDS",
    "NAPCAT_HISTORY_DAYS",
    "NAPCAT_HISTORY_LIMIT",
    "NAPCAT_COLLECT_MEMBER_LIST",
    "NAPCAT_COLLECT_MESSAGE_HISTORY",
    "NAPCAT_REQUEST_TIMEOUT_SECONDS",
    "NAPCAT_REQUEST_INTERVAL_MS",
    "NAPCAT_OUTPUT_DIR",
    "NAPCAT_ALLOW_REMOTE",
}


class ConfigError(RuntimeError):
    """表示本地采集配置不完整或不安全。"""


class NapCatApiError(RuntimeError):
    """表示 NapCat OneBot HTTP 调用失败。"""


class ImageDownloadError(RuntimeError):
    """表示关键图片下载失败或来源不安全。"""


@dataclass(frozen=True)
class Settings:
    base_url: str
    access_token: str
    allowed_group_ids: tuple[str, ...]
    history_days: int
    history_limit: int
    collect_members: bool
    collect_messages: bool
    timeout_seconds: float
    request_interval_seconds: float
    output_dir: Path


def missing_env_guide(env_file: Path) -> str:
    example_file = SKILL_DIR / ".env.example"
    return (
        f"未找到配置文件：{env_file}\n"
        "请先配置玩家群采集：\n"
        f"  cp {example_file} {env_file}\n"
        f"  chmod 600 {env_file}\n"
        "然后填写 NAPCAT_HTTP_URL、NAPCAT_GROUP_IDS；OneBot HTTP 配置了 token 时，"
        "同时填写 NAPCAT_ACCESS_TOKEN。\n"
        "注意：NAPCAT_HTTP_URL 是 OneBot HTTP Server 地址，不是 NapCat WebUI 地址。"
    )


def load_env_file(env_file: Path) -> dict[str, str]:
    if not env_file.is_file():
        raise ConfigError(missing_env_guide(env_file))

    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ConfigError(f"无法读取配置文件 {env_file}：{exc}") from exc

    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise ConfigError(f"{env_file}:{line_number} 不是 KEY=VALUE 格式")

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not ENV_KEY_PATTERN.fullmatch(key):
            raise ConfigError(f"{env_file}:{line_number} 包含无效环境变量名")
        if key not in KNOWN_CONFIG_KEYS:
            raise ConfigError(f"{env_file}:{line_number} 包含未知配置项 {key}")
        if key in values:
            raise ConfigError(f"{env_file}:{line_number} 重复配置了 {key}")
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ConfigError(f"{env_file}:{line_number} 的引号未闭合")
            value = value[1:-1]
        values[key] = value
    return values


def require_env(values: dict[str, str], name: str) -> str:
    value = values.get(name, "").strip()
    if not value:
        raise ConfigError(f"缺少必填配置 {name}；请编辑 Skill 目录中的 .env")
    return value


def parse_bool(values: dict[str, str], name: str, default: bool) -> bool:
    raw = values.get(name)
    if raw is None or not raw.strip():
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ConfigError(f"{name} 必须是 true 或 false")


def parse_int_env(
    values: dict[str, str], name: str, default: int, minimum: int, maximum: int
) -> int:
    raw = values.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} 必须是整数") from exc
    if not minimum <= value <= maximum:
        raise ConfigError(f"{name} 必须位于 {minimum}..{maximum}")
    return value


def parse_float_env(
    values: dict[str, str], name: str, default: float, minimum: float, maximum: float
) -> float:
    raw = values.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} 必须是数字") from exc
    if not minimum <= value <= maximum:
        raise ConfigError(f"{name} 必须位于 {minimum:g}..{maximum:g}")
    return value


def parse_group_ids(raw_values: list[str] | tuple[str, ...] | str) -> tuple[str, ...]:
    values = [raw_values] if isinstance(raw_values, str) else list(raw_values)
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        for candidate in raw.split(","):
            group_id = candidate.strip()
            if not group_id:
                continue
            if not GROUP_ID_PATTERN.fullmatch(group_id):
                raise ConfigError(f"无效 QQ 群号：{group_id!r}")
            if group_id not in seen:
                seen.add(group_id)
                result.append(group_id)
    if not result:
        raise ConfigError("NAPCAT_GROUP_IDS 至少需要配置一个 QQ 群号")
    return tuple(result)


def normalize_base_url(raw_url: str, allow_remote: bool, access_token: str) -> str:
    parsed = urllib.parse.urlsplit(raw_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ConfigError("NAPCAT_HTTP_URL 必须是有效的 http:// 或 https:// 地址")
    if parsed.username or parsed.password:
        raise ConfigError("NAPCAT_HTTP_URL 禁止内嵌用户名或密码")
    if parsed.query or parsed.fragment:
        raise ConfigError("NAPCAT_HTTP_URL 不应包含 query 或 fragment")
    try:
        parsed.port
    except ValueError as exc:
        raise ConfigError("NAPCAT_HTTP_URL 包含无效端口") from exc

    host = parsed.hostname.lower()
    is_loopback = host == "localhost"
    if not is_loopback:
        try:
            is_loopback = ipaddress.ip_address(host).is_loopback
        except ValueError:
            is_loopback = False

    if not is_loopback and not allow_remote:
        raise ConfigError(
            "NAPCAT_HTTP_URL 不是回环地址；确认确需远程连接后设置 "
            "NAPCAT_ALLOW_REMOTE=true，并配置非空 token"
        )
    if not is_loopback and not access_token:
        raise ConfigError("远程 NapCat OneBot HTTP 连接必须配置 NAPCAT_ACCESS_TOKEN")
    if not is_loopback and parsed.scheme != "https":
        raise ConfigError("远程 NapCat OneBot HTTP 连接必须使用 https://")

    path = parsed.path.rstrip("/")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def load_settings(env_file: Path) -> Settings:
    values = load_env_file(env_file)
    access_token = values.get("NAPCAT_ACCESS_TOKEN", "").strip()
    allow_remote = parse_bool(values, "NAPCAT_ALLOW_REMOTE", False)
    base_url = normalize_base_url(
        require_env(values, "NAPCAT_HTTP_URL"), allow_remote, access_token
    )
    allowed_group_ids = parse_group_ids(require_env(values, "NAPCAT_GROUP_IDS"))

    output_raw = values.get("NAPCAT_OUTPUT_DIR", ".runtime/collections").strip()
    if not output_raw:
        raise ConfigError("NAPCAT_OUTPUT_DIR 不能为空")
    output_dir = Path(output_raw).expanduser()
    if not output_dir.is_absolute():
        output_dir = SKILL_DIR / output_dir

    return Settings(
        base_url=base_url,
        access_token=access_token,
        allowed_group_ids=allowed_group_ids,
        history_days=parse_int_env(
            values, "NAPCAT_HISTORY_DAYS", 1, 1, MAX_HISTORY_DAYS
        ),
        history_limit=parse_int_env(
            values, "NAPCAT_HISTORY_LIMIT", 500, 1, MAX_HISTORY_LIMIT
        ),
        collect_members=parse_bool(values, "NAPCAT_COLLECT_MEMBER_LIST", True),
        collect_messages=parse_bool(values, "NAPCAT_COLLECT_MESSAGE_HISTORY", True),
        timeout_seconds=parse_float_env(
            values, "NAPCAT_REQUEST_TIMEOUT_SECONDS", 15.0, 1.0, 120.0
        ),
        request_interval_seconds=parse_float_env(
            values, "NAPCAT_REQUEST_INTERVAL_MS", 100.0, 0.0, 5000.0
        )
        / 1000.0,
        output_dir=output_dir,
    )


class NapCatClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._last_request_finished_at = 0.0

    def call(self, action: str, params: dict[str, Any] | None = None) -> Any:
        elapsed = time.monotonic() - self._last_request_finished_at
        remaining = self.settings.request_interval_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)

        url = f"{self.settings.base_url}/{action.lstrip('/')}"
        body = json.dumps(params or {}, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "qq-skill/1",
        }
        if self.settings.access_token:
            headers["Authorization"] = f"Bearer {self.settings.access_token}"
        request = urllib.request.Request(url, data=body, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(
                request, timeout=self.settings.timeout_seconds
            ) as response:
                raw_response = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw_response) > MAX_RESPONSE_BYTES:
                    raise NapCatApiError(
                        f"{action} 响应超过 {MAX_RESPONSE_BYTES // (1024 * 1024)} MiB 安全上限"
                    )
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                raise NapCatApiError(
                    f"{action} 鉴权失败（HTTP {exc.code}）；请核对 OneBot HTTP access token"
                ) from exc
            if exc.code == 404:
                raise NapCatApiError(
                    f"{action} 返回 HTTP 404；请确认 NAPCAT_HTTP_URL 指向 OneBot HTTP Server 根地址"
                ) from exc
            raise NapCatApiError(f"{action} 请求失败（HTTP {exc.code}）") from exc
        except urllib.error.URLError as exc:
            reason = str(getattr(exc, "reason", "连接失败"))
            raise NapCatApiError(
                f"无法连接 NapCat OneBot HTTP Server：{reason}。"
                "请确认 HTTP Server 已启用、监听地址和 Docker 端口映射正确"
            ) from exc
        except TimeoutError as exc:
            raise NapCatApiError(
                f"{action} 请求超时；可检查 NapCat 状态或调整 NAPCAT_REQUEST_TIMEOUT_SECONDS"
            ) from exc
        finally:
            self._last_request_finished_at = time.monotonic()

        try:
            payload = json.loads(raw_response.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise NapCatApiError(f"{action} 返回了非 JSON 响应") from exc
        if not isinstance(payload, dict):
            raise NapCatApiError(f"{action} 返回格式不是 OneBot 对象")

        retcode = payload.get("retcode")
        status = payload.get("status")
        if (retcode is not None and retcode != 0) or status == "failed":
            wording = str(payload.get("wording") or payload.get("message") or "未知错误")
            if self.settings.access_token:
                wording = wording.replace(self.settings.access_token, "[已隐藏]")
            raise NapCatApiError(
                f"{action} 调用失败（retcode={retcode!r}）：{wording[:160]}"
            )
        if "data" not in payload:
            raise NapCatApiError(f"{action} 响应缺少 data 字段")
        return payload["data"]


def parse_iso_time(raw: str, option_name: str) -> datetime:
    normalized = raw.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ConfigError(
            f"{option_name} 必须是 ISO 时间，例如 2026-07-14T00:00:00+08:00"
        ) from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.now().astimezone().tzinfo)
    return parsed


def select_group_ids(
    allowed_group_ids: tuple[str, ...], requested_group_ids: list[str] | None
) -> tuple[str, ...]:
    if not requested_group_ids:
        return allowed_group_ids
    selected = parse_group_ids(requested_group_ids)
    unauthorized = [group_id for group_id in selected if group_id not in allowed_group_ids]
    if unauthorized:
        raise ConfigError(
            "以下群号未列入 NAPCAT_GROUP_IDS 白名单：" + ", ".join(unauthorized)
        )
    return selected


def require_dict(action: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise NapCatApiError(f"{action} data 应为对象")
    return value


def require_list(action: str, value: Any) -> list[Any]:
    if not isinstance(value, list):
        raise NapCatApiError(f"{action} data 应为数组")
    return value


def message_key(message: dict[str, Any]) -> str:
    for field in ("message_id", "message_seq"):
        value = message.get(field)
        if value is not None and value != "":
            return f"{field}:{value}"
    sender = message.get("sender")
    sender_id = sender.get("user_id", "") if isinstance(sender, dict) else ""
    return f"fallback:{message.get('time', '')}:{sender_id}:{message.get('raw_message', '')}"


def fetch_group_messages(
    client: NapCatClient,
    group_id: str,
    since_timestamp: int,
    until_timestamp: int,
    limit: int,
) -> tuple[list[dict[str, Any]], bool]:
    messages_by_key: dict[str, dict[str, Any]] = {}
    current_anchor: Any = None
    previous_anchor: Any = object()
    reached_time_boundary = False
    pagination_complete = False
    pages_fetched = 0

    while (
        len(messages_by_key) < limit
        and not reached_time_boundary
        and pages_fetched < MAX_HISTORY_PAGES_PER_GROUP
    ):
        pages_fetched += 1
        page_size = min(100, limit - len(messages_by_key))
        params: dict[str, Any] = {
            "group_id": int(group_id),
            "count": page_size,
            "reverseOrder": True,
        }
        if current_anchor is not None and current_anchor != "":
            params["message_seq"] = current_anchor

        data = require_dict(
            "get_group_msg_history", client.call("get_group_msg_history", params)
        )
        raw_messages = data.get("messages")
        if not isinstance(raw_messages, list):
            raise NapCatApiError("get_group_msg_history data.messages 应为数组")
        if not raw_messages:
            pagination_complete = True
            break

        valid_page = [message for message in raw_messages if isinstance(message, dict)]
        if not valid_page:
            break

        timed_messages: list[tuple[int, dict[str, Any]]] = []
        for message in valid_page:
            try:
                timestamp = int(message.get("time", 0))
            except (TypeError, ValueError):
                continue
            if timestamp <= 0:
                continue
            timed_messages.append((timestamp, message))
            if since_timestamp <= timestamp <= until_timestamp:
                messages_by_key.setdefault(message_key(message), message)
            if timestamp < since_timestamp:
                reached_time_boundary = True

        if not timed_messages:
            break

        _, oldest_message = min(timed_messages, key=lambda item: item[0])
        next_anchor = oldest_message.get("message_seq")
        if next_anchor is None or next_anchor == "":
            next_anchor = oldest_message.get("message_id")
        if (
            next_anchor is None
            or next_anchor == ""
            or next_anchor == current_anchor
            or next_anchor == previous_anchor
        ):
            break

        previous_anchor = current_anchor
        current_anchor = next_anchor
        if len(valid_page) < page_size:
            pagination_complete = True
            break

    if reached_time_boundary:
        pagination_complete = True

    messages = sorted(
        messages_by_key.values(),
        key=lambda item: (int(item.get("time", 0) or 0), str(item.get("message_id", ""))),
    )[:limit]
    result_may_be_truncated = not pagination_complete
    return messages, result_may_be_truncated


def ensure_output_path(settings: Settings, requested_output: Path | None) -> Path:
    if requested_output is not None:
        output_path = requested_output.expanduser()
        if not output_path.is_absolute():
            output_path = Path.cwd() / output_path
    else:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        output_path = settings.output_dir / f"qq-{timestamp}.json"
    if output_path.suffix.lower() != ".json":
        raise ConfigError("输出文件必须使用 .json 扩展名")
    if output_path.exists():
        raise ConfigError(f"输出文件已存在，拒绝覆盖：{output_path}")
    return output_path


def write_private_json(output_path: Path, payload: dict[str, Any]) -> None:
    parent_existed = output_path.parent.exists()
    output_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not parent_existed:
        try:
            output_path.parent.chmod(0o700)
        except OSError:
            pass

    temporary_path: Path | None = None
    try:
        file_descriptor, raw_temporary_path = tempfile.mkstemp(
            prefix=f".{output_path.name}.", suffix=".tmp", dir=output_path.parent
        )
        temporary_path = Path(raw_temporary_path)
        os.fchmod(file_descriptor, 0o600)
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary_path, output_path)
        except FileExistsError as exc:
            raise ConfigError(f"输出文件已存在，拒绝覆盖：{output_path}") from exc
        temporary_path.unlink()
        temporary_path = None
        output_path.chmod(0o600)
    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass


def write_private_bytes(output_path: Path, payload: bytes) -> None:
    if output_path.exists():
        raise ConfigError(f"输出文件已存在，拒绝覆盖：{output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        output_path.parent.chmod(0o700)
    except OSError:
        pass

    temporary_path: Path | None = None
    try:
        file_descriptor, raw_temporary_path = tempfile.mkstemp(
            prefix=f".{output_path.name}.", suffix=".tmp", dir=output_path.parent
        )
        temporary_path = Path(raw_temporary_path)
        os.fchmod(file_descriptor, 0o600)
        with os.fdopen(file_descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary_path, output_path)
        except FileExistsError as exc:
            raise ConfigError(f"输出文件已存在，拒绝覆盖：{output_path}") from exc
        temporary_path.unlink()
        temporary_path = None
        output_path.chmod(0o600)
    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass


def resolve_existing_path(raw_path: Path, label: str) -> Path:
    path = raw_path.expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    if not path.is_file():
        raise ConfigError(f"{label}不存在或不是文件：{path}")
    return path.resolve()


def load_collection_snapshot(
    settings: Settings, raw_snapshot_path: Path
) -> tuple[Path, dict[str, Any]]:
    snapshot_path = resolve_existing_path(raw_snapshot_path, "采集快照")
    if snapshot_path.stat().st_size > MAX_SNAPSHOT_BYTES:
        raise ConfigError(
            f"采集快照超过 {MAX_SNAPSHOT_BYTES // (1024 * 1024)} MiB 安全上限"
        )
    try:
        with snapshot_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConfigError(f"无法读取采集快照 {snapshot_path}：{exc}") from exc
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise ConfigError("采集快照格式或 schema_version 不受支持")
    source = payload.get("source")
    if not isinstance(source, dict) or source.get("type") != "napcat-onebot-http":
        raise ConfigError("采集快照不是 qq.py 生成的 NapCat OneBot HTTP 快照")
    groups = payload.get("groups")
    if not isinstance(groups, list) or not groups:
        raise ConfigError("采集快照不包含群数据")
    for group in groups:
        if not isinstance(group, dict):
            raise ConfigError("采集快照 groups 中包含无效条目")
        group_id = str(group.get("group_id") or "")
        if group_id not in settings.allowed_group_ids:
            raise ConfigError("采集快照包含未列入 NAPCAT_GROUP_IDS 白名单的群")
        messages = group.get("messages")
        if messages is not None and not isinstance(messages, list):
            raise ConfigError("采集快照 messages 应为数组或 null")
    return snapshot_path, payload


def message_segments(message: dict[str, Any]) -> list[dict[str, Any]]:
    raw_segments = message.get("message")
    if not isinstance(raw_segments, list):
        return []
    return [segment for segment in raw_segments if isinstance(segment, dict)]


def sender_key(message: dict[str, Any], fallback: str) -> str:
    sender = message.get("sender")
    sender_id = sender.get("user_id") if isinstance(sender, dict) else None
    value = message.get("user_id") or sender_id
    return str(value) if value not in {None, ""} else fallback


def build_sender_aliases(groups: list[Any]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for group_index, group in enumerate(groups):
        if not isinstance(group, dict):
            continue
        messages = group.get("messages")
        if not isinstance(messages, list):
            continue
        for message_index, message in enumerate(messages):
            if not isinstance(message, dict):
                continue
            key = sender_key(message, f"anonymous:{group_index}:{message_index}")
            if key not in aliases:
                aliases[key] = f"成员{len(aliases) + 1}"
    return aliases


def message_alias(
    aliases: dict[str, str],
    message: dict[str, Any],
    group_index: int,
    message_index: int,
) -> str:
    key = sender_key(message, f"anonymous:{group_index}:{message_index}")
    return aliases.get(key, "成员")


def render_message_text(message: dict[str, Any]) -> str:
    parts: list[str] = []
    image_number = 0
    for segment in message_segments(message):
        segment_type = str(segment.get("type") or "unknown")
        data = segment.get("data")
        data = data if isinstance(data, dict) else {}
        if segment_type == "text":
            parts.append(str(data.get("text") or ""))
        elif segment_type == "at":
            parts.append("@成员")
        elif segment_type == "image":
            image_number += 1
            if data.get("emoji_id") or data.get("emoji_package_id"):
                parts.append("[动画表情]")
            else:
                parts.append(f"[图片{image_number}]")
        elif segment_type == "face":
            parts.append("[表情]")
        elif segment_type == "reply":
            parts.append("[回复]")
        else:
            parts.append(f"[{segment_type}]")
    text = "".join(parts)
    return re.sub(r"\s+", " ", text).strip()


def message_timestamp(message: dict[str, Any]) -> str | None:
    try:
        timestamp = int(message.get("time", 0))
    except (TypeError, ValueError):
        return None
    if timestamp <= 0:
        return None
    return datetime.fromtimestamp(timestamp).astimezone().isoformat()


def compact_message_context(
    aliases: dict[str, str],
    message: dict[str, Any],
    group_index: int,
    message_index: int,
) -> dict[str, Any]:
    return {
        "ref": f"{group_index}:{message_index}",
        "time": message_timestamp(message),
        "sender": message_alias(aliases, message, group_index, message_index),
        "text": render_message_text(message),
    }


def is_emoji_image_data(data: dict[str, Any]) -> bool:
    summary = str(data.get("summary") or "")
    return bool(
        data.get("emoji_id")
        or data.get("emoji_package_id")
        or "动画表情" in summary
    )


def image_descriptors(message: dict[str, Any]) -> list[dict[str, Any]]:
    descriptors: list[dict[str, Any]] = []
    for segment in message_segments(message):
        if segment.get("type") != "image":
            continue
        data = segment.get("data")
        data = data if isinstance(data, dict) else {}
        raw_file_size = data.get("file_size")
        try:
            file_size = int(raw_file_size) if raw_file_size not in {None, ""} else None
        except (TypeError, ValueError):
            file_size = None
        is_emoji = is_emoji_image_data(data)
        descriptors.append(
            {
                "image_index": len(descriptors),
                "kind": "emoji" if is_emoji else "image",
                "summary": str(data.get("summary") or "")[:120],
                "sub_type": data.get("sub_type"),
                "size_bytes": file_size,
            }
        )
    return descriptors


def build_image_candidate_index(
    snapshot_path: Path, payload: dict[str, Any], context_size: int
) -> dict[str, Any]:
    groups = require_list("snapshot.groups", payload.get("groups"))
    aliases = build_sender_aliases(groups)
    messages_by_id: dict[tuple[int, str], tuple[int, int, dict[str, Any]]] = {}
    for group_index, group in enumerate(groups):
        messages = group.get("messages") if isinstance(group, dict) else None
        if not isinstance(messages, list):
            continue
        for message_index, message in enumerate(messages):
            if not isinstance(message, dict):
                continue
            raw_message_id = message.get("message_id")
            if raw_message_id not in {None, ""}:
                messages_by_id.setdefault(
                    (group_index, str(raw_message_id)),
                    (group_index, message_index, message),
                )

    candidates: list[dict[str, Any]] = []
    for group_index, group in enumerate(groups):
        if not isinstance(group, dict):
            continue
        messages = group.get("messages")
        if not isinstance(messages, list):
            continue
        group_info = group.get("group_info")
        group_name = (
            str(group_info.get("group_name") or "")
            if isinstance(group_info, dict)
            else ""
        )
        for message_index, message in enumerate(messages):
            if not isinstance(message, dict):
                continue
            images = image_descriptors(message)
            if not images:
                continue
            reply_context: dict[str, Any] | None = None
            for segment in message_segments(message):
                if segment.get("type") != "reply":
                    continue
                data = segment.get("data")
                reply_id = data.get("id") if isinstance(data, dict) else None
                target = (
                    messages_by_id.get((group_index, str(reply_id)))
                    if reply_id not in {None, ""}
                    else None
                )
                if target is None:
                    reply_context = {"resolved": False}
                else:
                    target_group_index, target_message_index, target_message = target
                    reply_context = {
                        "resolved": True,
                        "message": compact_message_context(
                            aliases,
                            target_message,
                            target_group_index,
                            target_message_index,
                        ),
                    }
                break

            before_start = max(0, message_index - context_size)
            after_end = min(len(messages), message_index + context_size + 1)
            context_before = [
                compact_message_context(aliases, item, group_index, item_index)
                for item_index, item in enumerate(
                    messages[before_start:message_index], start=before_start
                )
                if isinstance(item, dict)
            ]
            context_after = [
                compact_message_context(aliases, item, group_index, item_index)
                for item_index, item in enumerate(
                    messages[message_index + 1 : after_end], start=message_index + 1
                )
                if isinstance(item, dict)
            ]
            candidates.append(
                {
                    "ref": f"{group_index}:{message_index}",
                    "group_name": group_name,
                    "message": compact_message_context(
                        aliases, message, group_index, message_index
                    ),
                    "reply": reply_context,
                    "context_before": context_before,
                    "context_after": context_after,
                    "images": images,
                }
            )

    return {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_snapshot": snapshot_path.name,
        "context_messages_each_side": context_size,
        "candidate_count": len(candidates),
        "candidates": candidates,
    }


def ensure_new_json_path(
    requested_output: Path | None, default_parent: Path, default_stem: str
) -> Path:
    if requested_output is not None:
        output_path = requested_output.expanduser()
        if not output_path.is_absolute():
            output_path = Path.cwd() / output_path
    else:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        output_path = default_parent / f"{default_stem}-{timestamp}.json"
    if output_path.suffix.lower() != ".json":
        raise ConfigError("输出文件必须使用 .json 扩展名")
    if output_path.exists():
        raise ConfigError(f"输出文件已存在，拒绝覆盖：{output_path}")
    return output_path


def run_index_images(settings: Settings, args: argparse.Namespace) -> None:
    if not 0 <= args.context <= MAX_IMAGE_CONTEXT_MESSAGES:
        raise ConfigError(
            f"--context 必须位于 0..{MAX_IMAGE_CONTEXT_MESSAGES}"
        )
    snapshot_path, payload = load_collection_snapshot(settings, args.snapshot)
    index_payload = build_image_candidate_index(snapshot_path, payload, args.context)
    runtime_root = settings.output_dir.parent
    output_path = ensure_new_json_path(
        args.output,
        runtime_root / "image-indexes",
        f"{snapshot_path.stem}-images",
    )
    write_private_json(output_path, index_payload)
    print(
        f"图片候选索引完成：{index_payload['candidate_count']} 条含图片消息。"
    )
    print(f"输出文件：{output_path}")


def parse_message_refs(raw_refs: list[str]) -> list[tuple[int, int]]:
    refs: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for raw_ref in raw_refs:
        for candidate in raw_ref.split(","):
            value = candidate.strip()
            if not value:
                continue
            match = MESSAGE_REF_PATTERN.fullmatch(value)
            if match is None:
                raise ConfigError(
                    f"无效消息引用 {value!r}；应为候选索引中的 group_index:message_index"
                )
            parsed = (
                int(match.group("group_index")),
                int(match.group("message_index")),
            )
            if parsed not in seen:
                seen.add(parsed)
                refs.append(parsed)
    if not refs:
        raise ConfigError("至少需要一个 --message-ref")
    if len(refs) > MAX_SELECTED_MESSAGE_REFS:
        raise ConfigError(
            f"单次最多读取 {MAX_SELECTED_MESSAGE_REFS} 条含图片消息；请分批渐进查看"
        )
    return refs


def validate_image_url(raw_url: str) -> str:
    parsed = urllib.parse.urlsplit(raw_url.strip())
    if parsed.scheme != "https" or not parsed.hostname:
        raise ImageDownloadError("图片 URL 必须使用可信 HTTPS 地址")
    if parsed.username or parsed.password:
        raise ImageDownloadError("图片 URL 禁止内嵌用户名或密码")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ImageDownloadError("图片 URL 包含无效端口") from exc
    if port not in {None, 443}:
        raise ImageDownloadError("图片 URL 只允许使用 HTTPS 默认端口")
    host = parsed.hostname.lower().rstrip(".")
    if not any(
        host == suffix or host.endswith(f".{suffix}")
        for suffix in ALLOWED_IMAGE_HOST_SUFFIXES
    ):
        raise ImageDownloadError(f"图片来源域名不在 QQ/Tencent 允许列表：{host}")
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.query, "")
    )


class SafeImageRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> urllib.request.Request | None:
        absolute_url = urllib.parse.urljoin(request.full_url, new_url)
        validate_image_url(absolute_url)
        return super().redirect_request(
            request, file_pointer, code, message, headers, absolute_url
        )


def sniff_image_type(payload: bytes) -> tuple[str, str]:
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png", "image/png"
    if payload.startswith(b"\xff\xd8\xff"):
        return ".jpg", "image/jpeg"
    if payload.startswith((b"GIF87a", b"GIF89a")):
        return ".gif", "image/gif"
    if len(payload) >= 12 and payload.startswith(b"RIFF") and payload[8:12] == b"WEBP":
        return ".webp", "image/webp"
    if payload.startswith(b"BM"):
        return ".bmp", "image/bmp"
    raise ImageDownloadError("下载内容不是受支持的 PNG/JPEG/GIF/WebP/BMP 图片")


def download_image(raw_url: str, timeout_seconds: float) -> tuple[bytes, str, str]:
    url = validate_image_url(raw_url)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "image/png,image/jpeg,image/webp,image/gif,image/bmp,*/*;q=0.1",
            "User-Agent": "qq-skill/1",
        },
        method="GET",
    )
    opener = urllib.request.build_opener(SafeImageRedirectHandler())
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            validate_image_url(response.geturl())
            raw_content_length = response.headers.get("Content-Length")
            if raw_content_length:
                try:
                    content_length = int(raw_content_length)
                except ValueError:
                    content_length = 0
                if content_length > MAX_IMAGE_BYTES:
                    raise ImageDownloadError(
                        f"图片超过 {MAX_IMAGE_BYTES // (1024 * 1024)} MiB 安全上限"
                    )
            payload = response.read(MAX_IMAGE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ImageDownloadError(f"图片下载失败（HTTP {exc.code}）") from exc
    except urllib.error.URLError as exc:
        reason = str(getattr(exc, "reason", "连接失败"))
        raise ImageDownloadError(f"图片下载连接失败：{reason}") from exc
    except TimeoutError as exc:
        raise ImageDownloadError("图片下载超时") from exc
    if len(payload) > MAX_IMAGE_BYTES:
        raise ImageDownloadError(
            f"图片超过 {MAX_IMAGE_BYTES // (1024 * 1024)} MiB 安全上限"
        )
    extension, mime_type = sniff_image_type(payload)
    return payload, extension, mime_type


def selected_message(
    groups: list[Any], group_index: int, message_index: int
) -> dict[str, Any]:
    if not 0 <= group_index < len(groups):
        raise ConfigError(f"消息引用 {group_index}:{message_index} 的群索引越界")
    group = groups[group_index]
    messages = group.get("messages") if isinstance(group, dict) else None
    if not isinstance(messages, list) or not 0 <= message_index < len(messages):
        raise ConfigError(f"消息引用 {group_index}:{message_index} 的消息索引越界")
    message = messages[message_index]
    if not isinstance(message, dict):
        raise ConfigError(f"消息引用 {group_index}:{message_index} 不是有效消息")
    return message


def run_fetch_images(settings: Settings, args: argparse.Namespace) -> None:
    snapshot_path, payload = load_collection_snapshot(settings, args.snapshot)
    groups = require_list("snapshot.groups", payload.get("groups"))
    refs = parse_message_refs(args.message_ref)
    runtime_root = settings.output_dir.parent
    if args.output_dir is not None:
        output_dir = args.output_dir.expanduser()
        if not output_dir.is_absolute():
            output_dir = Path.cwd() / output_dir
    else:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        output_dir = runtime_root / "images" / f"{snapshot_path.stem}-{timestamp}"
    if output_dir.exists():
        raise ConfigError(f"输出目录已存在，拒绝覆盖：{output_dir}")
    output_dir.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        output_dir.parent.chmod(0o700)
    except OSError:
        pass

    temporary_dir = Path(
        tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent)
    )
    temporary_dir.chmod(0o700)
    downloaded: list[dict[str, Any]] = []
    skipped_emoji_count = 0
    total_downloaded_bytes = 0
    try:
        for group_index, message_index in refs:
            message = selected_message(groups, group_index, message_index)
            image_index = 0
            found_image = False
            for segment in message_segments(message):
                if segment.get("type") != "image":
                    continue
                found_image = True
                data = segment.get("data")
                data = data if isinstance(data, dict) else {}
                is_emoji = is_emoji_image_data(data)
                if is_emoji and not args.include_emoji:
                    skipped_emoji_count += 1
                    image_index += 1
                    continue
                raw_url = data.get("url")
                if not isinstance(raw_url, str) or not raw_url.strip():
                    raise ImageDownloadError(
                        f"消息 {group_index}:{message_index} 的图片缺少可下载 URL"
                    )
                if len(downloaded) >= MAX_SELECTED_IMAGES:
                    raise ConfigError(
                        f"单次最多读取 {MAX_SELECTED_IMAGES} 张图片；请缩小消息选择范围"
                    )
                image_payload, extension, mime_type = download_image(
                    raw_url, settings.timeout_seconds
                )
                if total_downloaded_bytes + len(image_payload) > MAX_TOTAL_IMAGE_BYTES:
                    raise ConfigError(
                        "单次图片总量超过 "
                        f"{MAX_TOTAL_IMAGE_BYTES // (1024 * 1024)} MiB；请分批查看"
                    )
                filename = (
                    f"g{group_index}-m{message_index}-i{image_index}{extension}"
                )
                write_private_bytes(temporary_dir / filename, image_payload)
                total_downloaded_bytes += len(image_payload)
                downloaded.append(
                    {
                        "message_ref": f"{group_index}:{message_index}",
                        "image_index": image_index,
                        "file": filename,
                        "mime_type": mime_type,
                        "size_bytes": len(image_payload),
                    }
                )
                image_index += 1
            if not found_image:
                raise ConfigError(f"消息 {group_index}:{message_index} 不包含图片")
        if not downloaded:
            raise ConfigError("所选消息没有可读取的普通图片；动画表情默认不会下载")
        write_private_json(
            temporary_dir / "manifest.json",
            {
                "schema_version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source_snapshot": snapshot_path.name,
                "downloaded": downloaded,
                "skipped_emoji_count": skipped_emoji_count,
            },
        )
        os.rename(temporary_dir, output_dir)
    except Exception:
        shutil.rmtree(temporary_dir, ignore_errors=True)
        raise

    print(
        f"关键图片下载完成：{len(downloaded)} 张；"
        f"跳过动画表情 {skipped_emoji_count} 张。"
    )
    for item in downloaded:
        print(f"图片文件：{output_dir / item['file']}")


def run_check(client: NapCatClient, group_ids: tuple[str, ...]) -> None:
    require_dict("get_login_info", client.call("get_login_info"))
    print("NapCat 登录态与 OneBot HTTP 连接正常。")
    for group_id in group_ids:
        group_info = require_dict(
            "get_group_info",
            client.call("get_group_info", {"group_id": int(group_id), "no_cache": True}),
        )
        group_name = str(group_info.get("group_name") or "未返回群名")
        print(f"群 {group_id}：可访问（{group_name}）")
    print(f"检查完成：{len(group_ids)} 个白名单群均可访问。")


def run_collect(
    client: NapCatClient,
    settings: Settings,
    group_ids: tuple[str, ...],
    args: argparse.Namespace,
) -> None:
    require_dict("get_login_info", client.call("get_login_info"))

    now = datetime.now().astimezone()
    until = parse_iso_time(args.until, "--until") if args.until else now
    days = args.days if args.days is not None else settings.history_days
    if not 1 <= days <= MAX_HISTORY_DAYS:
        raise ConfigError(f"--days 必须位于 1..{MAX_HISTORY_DAYS}")
    since = parse_iso_time(args.since, "--since") if args.since else until - timedelta(days=days)
    if since >= until:
        raise ConfigError("采集开始时间必须早于结束时间")

    limit = args.limit if args.limit is not None else settings.history_limit
    if not 1 <= limit <= MAX_HISTORY_LIMIT:
        raise ConfigError(f"--limit 必须位于 1..{MAX_HISTORY_LIMIT}")

    collect_members = settings.collect_members and not args.no_members
    collect_messages = settings.collect_messages and not args.no_messages
    if not collect_members and not collect_messages:
        print("成员列表与历史消息均已关闭，本次仅采集群资料。")

    collected_groups: list[dict[str, Any]] = []
    total_members = 0
    total_messages = 0
    since_timestamp = int(since.timestamp())
    until_timestamp = int(until.timestamp())

    for group_id in group_ids:
        group_info = require_dict(
            "get_group_info",
            client.call("get_group_info", {"group_id": int(group_id), "no_cache": True}),
        )

        members: list[Any] | None = None
        if collect_members:
            members = require_list(
                "get_group_member_list",
                client.call(
                    "get_group_member_list",
                    {"group_id": int(group_id), "no_cache": True},
                ),
            )
            total_members += len(members)

        messages: list[dict[str, Any]] | None = None
        messages_may_be_truncated = False
        if collect_messages:
            messages, messages_may_be_truncated = fetch_group_messages(
                client,
                group_id,
                since_timestamp,
                until_timestamp,
                limit,
            )
            total_messages += len(messages)

        collected_groups.append(
            {
                "group_id": group_id,
                "group_info": group_info,
                "members": members,
                "messages": messages,
                "summary": {
                    "member_count": len(members) if members is not None else None,
                    "message_count": len(messages) if messages is not None else None,
                    "messages_may_be_truncated": messages_may_be_truncated,
                },
            }
        )

    output_path = ensure_output_path(settings, args.output)
    payload = {
        "schema_version": 1,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "type": "napcat-onebot-http",
            "base_url": settings.base_url,
        },
        "scope": {
            "group_ids": list(group_ids),
            "since": since.isoformat(),
            "until": until.isoformat(),
            "history_limit_per_group": limit,
            "member_list_enabled": collect_members,
            "message_history_enabled": collect_messages,
        },
        "groups": collected_groups,
    }
    write_private_json(output_path, payload)
    print(
        f"采集完成：{len(collected_groups)} 个群，"
        f"{total_members} 条成员记录，{total_messages} 条历史消息。"
    )
    print(f"输出文件：{output_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="只读采集白名单 QQ 玩家群信息，并渐进提取关键反馈图片"
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_FILE,
        help="配置文件路径，默认 Skill 根目录 .env",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check", help="检查连接和白名单群访问权限")
    check_parser.add_argument(
        "--group-id", action="append", help="只检查指定白名单群，可重复或逗号分隔"
    )

    collect_parser = subparsers.add_parser("collect", help="采集群资料、成员与历史消息")
    collect_parser.add_argument(
        "--group-id", action="append", help="只采集指定白名单群，可重复或逗号分隔"
    )
    collect_parser.add_argument("--since", help="ISO 格式开始时间，优先于 --days")
    collect_parser.add_argument("--until", help="ISO 格式结束时间，默认当前时间")
    collect_parser.add_argument("--days", type=int, help="回溯天数")
    collect_parser.add_argument("--limit", type=int, help="每群最多保留的消息数")
    collect_parser.add_argument("--no-members", action="store_true", help="不采集成员列表")
    collect_parser.add_argument("--no-messages", action="store_true", help="不采集历史消息")
    collect_parser.add_argument("--output", type=Path, help="指定 JSON 输出文件")

    index_images_parser = subparsers.add_parser(
        "index-images", help="生成含图片消息的脱敏上下文候选索引"
    )
    index_images_parser.add_argument(
        "--snapshot", type=Path, required=True, help="qq.py collect 生成的 JSON 快照"
    )
    index_images_parser.add_argument(
        "--context",
        type=int,
        default=2,
        help=f"每侧附带的相邻消息数，默认 2，最大 {MAX_IMAGE_CONTEXT_MESSAGES}",
    )
    index_images_parser.add_argument(
        "--output", type=Path, help="指定候选索引 JSON 输出文件"
    )

    fetch_images_parser = subparsers.add_parser(
        "fetch-images", help="仅下载候选索引中明确选定的关键图片"
    )
    fetch_images_parser.add_argument(
        "--snapshot", type=Path, required=True, help="qq.py collect 生成的 JSON 快照"
    )
    fetch_images_parser.add_argument(
        "--message-ref",
        action="append",
        required=True,
        help="候选索引中的 group_index:message_index，可重复或逗号分隔",
    )
    fetch_images_parser.add_argument(
        "--include-emoji",
        action="store_true",
        help="同时下载动画表情；默认跳过",
    )
    fetch_images_parser.add_argument(
        "--output-dir", type=Path, help="指定新的图片输出目录"
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        env_file = args.env_file.expanduser()
        if not env_file.is_absolute():
            env_file = Path.cwd() / env_file
        settings = load_settings(env_file)
        if args.command == "check":
            group_ids = select_group_ids(settings.allowed_group_ids, args.group_id)
            client = NapCatClient(settings)
            run_check(client, group_ids)
        elif args.command == "collect":
            group_ids = select_group_ids(settings.allowed_group_ids, args.group_id)
            client = NapCatClient(settings)
            run_collect(client, settings, group_ids, args)
        elif args.command == "index-images":
            run_index_images(settings, args)
        elif args.command == "fetch-images":
            run_fetch_images(settings, args)
        else:
            parser.error(f"未知命令：{args.command}")
        return 0
    except ConfigError as exc:
        print(f"配置错误：{exc}", file=sys.stderr)
        return 2
    except NapCatApiError as exc:
        print(f"NapCat API 错误：{exc}", file=sys.stderr)
        return 3
    except ImageDownloadError as exc:
        print(f"图片读取错误：{exc}", file=sys.stderr)
        return 4
    except KeyboardInterrupt:
        print("采集已取消。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
