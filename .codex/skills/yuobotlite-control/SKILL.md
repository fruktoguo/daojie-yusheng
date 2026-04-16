---
name: yuobotlite-control
description: Use when the task mentions YuoBotLite, yuobotlite, yuobotlite-hook, external loop control, completion signaling, or commands such as loop, loop off, loop done, or loop status.
---

# YuoBotLite Control

This workspace is running inside YuoBotLite.

You have a local command available on PATH:

`yuobotlite-hook`

Use it to communicate with the outer YuoBotLite control service.

Commands:

- `yuobotlite-hook status`
- `yuobotlite-hook done`
- `yuobotlite-hook mode status`
- `yuobotlite-hook mode plan`
- `yuobotlite-hook mode default`
- `yuobotlite-hook draft-show`
- `yuobotlite-hook draft-clear`
- `yuobotlite-hook draft-set task "<value>"`
- `yuobotlite-hook draft-set done-goal "<value>"`
- `yuobotlite-hook draft-set continue-instruction "<value>"`
- `yuobotlite-hook plan-apply`
- `yuobotlite-hook loop-on "<task>" "<continueText>"`
- `yuobotlite-hook loop-off`

Treat the following user inputs as reserved pseudo-commands:

- `loop`
- `loop off`
- `loop done`
- `loop status`

Rules:

1. Treat the outer interaction mode as authoritative. Use `yuobotlite-hook mode status` or `yuobotlite-hook status` to inspect it.
2. On bare `loop`, do not explain the skill first. Do not narrate tool discovery. Immediately run:
   - `yuobotlite-hook mode plan`
   - `yuobotlite-hook draft-clear`
3. Then ask only for the missing fields in one concise message.
4. In plan mode, do not start the loop immediately. You must first collect the draft fields below.
5. The minimum required fields before enabling loop are:
   - 循环任务内容
   - 任务结束目标
   - 每次继续时发送的继续指令
6. As you collect fields, persist them immediately:
   - `yuobotlite-hook draft-set task "<value>"`
   - `yuobotlite-hook draft-set done-goal "<value>"`
   - `yuobotlite-hook draft-set continue-instruction "<value>"`
7. If the user gives only part of the data, ask only for the missing fields. Use `yuobotlite-hook draft-show` if you need to inspect what is already stored.
8. Once all three draft fields are complete, call:
   - `yuobotlite-hook plan-apply`
9. `plan-apply` switches the outer service back to default mode and enables loop using a synthesized continue instruction.
10. When the task is truly complete, run `yuobotlite-hook done`.
11. Do not call `yuobotlite-hook done` early.
12. If the user enters `loop off`, run:
   - `yuobotlite-hook loop-off`
   - `yuobotlite-hook mode default`
13. If the user enters `loop done`, run `yuobotlite-hook done`.
14. If the user enters `loop status`, run `yuobotlite-hook status`.
15. Do not say you are "checking the skill" or "reading the skill" before handling these commands. Just handle them.

Preferred follow-up template when the user enters bare `loop`:

```text
要启动循环，我还需要这 3 项：
1. 循环任务内容
2. 任务结束目标
3. 每次继续时的指令

你可以直接按这个格式回复：
循环任务内容：
任务结束目标：
继续指令：
```

Preferred continueText shape:

```text
继续当前循环任务：<循环任务内容>

本轮目标：
- 围绕上面的循环任务继续推进。
- 以“<任务结束目标>”作为完成标准。
- 执行用户给定的继续指令：<继续指令>

只有在任务真正完成时，才执行：
yuobotlite-hook done

如果尚未完成，就继续推进，不要提前调用 done。
```

