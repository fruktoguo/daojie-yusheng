import argparse
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import qq  # noqa: E402


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def call(self, action: str, params: dict[str, object] | None = None):
        payload = params or {}
        self.calls.append((action, payload))
        if action == "get_group_member_info":
            return {"user_id": payload["user_id"]}
        if action == "send_group_msg":
            return {"message_id": 123456}
        raise AssertionError(f"未预期 action：{action}")


class FakeUncertainClient(FakeClient):
    def call(self, action: str, params: dict[str, object] | None = None):
        if action == "send_group_msg":
            self.calls.append((action, params or {}))
            raise qq.NapCatApiError("模拟发送超时")
        return super().call(action, params)


class SendSummaryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.settings = qq.Settings(
            base_url="http://127.0.0.1:5700",
            access_token="",
            allowed_group_ids=("100000001",),
            history_days=1,
            history_limit=500,
            collect_members=True,
            collect_messages=True,
            timeout_seconds=15,
            request_interval_seconds=0,
            output_dir=self.root / "collections",
            allow_send=True,
        )
        self.outgoing_dir = self.root / "outgoing"
        self.outgoing_dir.mkdir(mode=0o700)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write_message(self, text: str = "问题已记录，正在进一步排查。") -> Path:
        path = self.outgoing_dir / "summary.txt"
        path.write_text(text, encoding="utf-8")
        path.chmod(0o600)
        return path

    def args(self, message_file: Path) -> argparse.Namespace:
        return argparse.Namespace(
            user_id="200000001",
            dedupe_key="feedback:test:0001",
            message_file=message_file,
        )

    def test_send_summary_uses_at_segment_and_records_delivery(self) -> None:
        client = FakeClient()
        message_file = self.write_message()

        with contextlib.redirect_stdout(io.StringIO()):
            qq.run_send_summary(
                client, self.settings, "100000001", self.args(message_file)
            )

        self.assertFalse(message_file.exists())
        self.assertEqual(
            [action for action, _ in client.calls],
            [
                "get_group_member_info",
                "send_group_msg",
            ],
        )
        send_params = client.calls[1][1]
        self.assertEqual(send_params["group_id"], 100000001)
        self.assertEqual(
            send_params["message"][0],
            {"type": "at", "data": {"qq": "200000001"}},
        )
        ledger = json.loads(
            (self.root / "deliveries" / "send-summary.json").read_text(encoding="utf-8")
        )
        self.assertEqual(ledger["deliveries"]["feedback:test:0001"]["status"], "sent")

    def test_same_dedupe_key_does_not_send_twice(self) -> None:
        client = FakeClient()
        first_file = self.write_message()
        with contextlib.redirect_stdout(io.StringIO()):
            qq.run_send_summary(
                client, self.settings, "100000001", self.args(first_file)
            )
        second_file = self.write_message()
        with contextlib.redirect_stdout(io.StringIO()):
            qq.run_send_summary(
                client, self.settings, "100000001", self.args(second_file)
            )

        actions = [action for action, _ in client.calls]
        self.assertEqual(actions.count("send_group_msg"), 1)
        self.assertFalse(second_file.exists())

    def test_reject_message_file_outside_outgoing_directory(self) -> None:
        path = self.root / "outside.txt"
        path.write_text("不应发送", encoding="utf-8")
        path.chmod(0o600)
        with self.assertRaisesRegex(qq.ConfigError, "必须位于私密目录"):
            qq.load_summary_message(self.settings, path)

    def test_reject_overly_permissive_message_file(self) -> None:
        path = self.write_message()
        path.chmod(0o644)
        with self.assertRaisesRegex(qq.ConfigError, "权限过宽"):
            qq.load_summary_message(self.settings, path)

    def test_send_is_disabled_by_default_policy(self) -> None:
        disabled = qq.Settings(
            **{
                **self.settings.__dict__,
                "allow_send": False,
            }
        )
        with self.assertRaisesRegex(qq.ConfigError, "未启用"):
            qq.run_send_summary(
                FakeClient(),
                disabled,
                "100000001",
                self.args(self.write_message()),
            )

    def test_uncertain_send_is_not_retried(self) -> None:
        client = FakeUncertainClient()
        with self.assertRaisesRegex(qq.NapCatApiError, "模拟发送超时"):
            qq.run_send_summary(
                client,
                self.settings,
                "100000001",
                self.args(self.write_message()),
            )
        ledger = json.loads(
            (self.root / "deliveries" / "send-summary.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            ledger["deliveries"]["feedback:test:0001"]["status"], "uncertain"
        )
        with self.assertRaisesRegex(qq.ConfigError, "拒绝自动重试"):
            qq.run_send_summary(
                client,
                self.settings,
                "100000001",
                self.args(self.write_message()),
            )
        actions = [action for action, _ in client.calls]
        self.assertEqual(actions.count("send_group_msg"), 1)


if __name__ == "__main__":
    unittest.main()
