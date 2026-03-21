# GitHub 同步到 Gitee

本文档补充一条可选链路：GitHub `push main` 后，自动把同名仓库同步到 Gitee。它不会替代现有的 GitHub 自动部署，只是多一条国内镜像入口，方便后续由国内服务器从 Gitee 拉取代码。

## 链路概览

1. 本地 `git push origin main`
2. GitHub Actions 触发 [`.github/workflows/sync.yml`](../.github/workflows/sync.yml)
3. Actions 使用 Gitee SSH 私钥直接执行 `git push` 到 Gitee
4. Gitee 仓库收到更新后触发 WebHook
5. 国内服务器监听 WebHook，执行 `git pull`、构建和重启

当前仓库已经存在 GitHub 直连生产部署链路，见 [docs/deploy.md](./deploy.md)。如果你只是想保留现有 GitHub 部署，不需要配置本页。

## 第一步：在 Gitee 准备镜像仓库与凭证

### 1. 导入 GitHub 仓库

在 Gitee 网页端使用“从 GitHub/Git 导入仓库”，导入当前 GitHub 仓库。建议保持仓库名与 GitHub 一致，这样工作流可以直接复用仓库名，不需要再改 YAML。

### 2. 生成一对新的 SSH 密钥

建议单独为 GitHub Actions 生成一对新密钥，不与本机常用登录密钥混用：

```bash
ssh-keygen -t ed25519 -C "github-actions-to-gitee" -f ~/.ssh/gitee_mirror_ed25519
```

生成后：

- 私钥文件：`~/.ssh/gitee_mirror_ed25519`
- 公钥文件：`~/.ssh/gitee_mirror_ed25519.pub`

把公钥内容复制到 Gitee 的 SSH 公钥设置里：

```bash
cat ~/.ssh/gitee_mirror_ed25519.pub
```

后面把私钥内容存进 GitHub Secrets 的 `GITEE_PRIVATE_KEY`：

```bash
cat ~/.ssh/gitee_mirror_ed25519
```

## 第二步：在 GitHub 配置 Actions Secrets 与 Variables

进入当前仓库：

`Settings -> Secrets and variables -> Actions`

新增以下 Secrets：

- `GITEE_PRIVATE_KEY`：上一步生成的 SSH 私钥全文

新增以下 Repository variable：

- `GITEE_OWNER`：你的 Gitee 用户名或组织名

说明：

- `GITEE_TOKEN` 不是这版工作流的必需项；如果你已经配了，可以保留，不影响运行
- 当前工作流直接按 `git@gitee.com:<owner>/<repo>.git` 推送，所以只需要 `GITEE_OWNER`

## 第三步：提交同步工作流

仓库已提供 [`.github/workflows/sync.yml`](../.github/workflows/sync.yml)，默认行为如下：

- 只在 `push main` 和手动触发时运行
- 将当前 GitHub 仓库的 `main` 分支直接推送到 Gitee 同名仓库
- 不影响现有 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 的生产部署

如果你在 Gitee 导入时改了仓库名，需要把工作流里的目标地址从 `${GITHUB_REPOSITORY#*/}.git` 改成实际仓库名。

首次提交后，可在 GitHub 的 `Actions` 页面查看 `Sync To Gitee` 是否成功。

## 第四步：在 Gitee 配置 WebHook

进入 Gitee 仓库设置，找到 `WebHooks`，新增一个推送事件回调：

- URL：你国内服务器暴露出来的公网 HTTP 地址
- 触发事件：`Push`
- 可选：开启签名密钥，服务端校验来源

配置完成后，Gitee 每次收到同步后的新提交，都会向这个地址发起一次 `POST`。

## 第五步：在国内服务器监听通知并执行拉取

这一部分应部署在对方服务器上。最小职责只有三件事：

1. 校验 Gitee WebHook 请求
2. 在本地仓库执行 `git pull`
3. 触发构建与重启

下面是一个最小 Node.js 示例，只演示流程，不包含进程守护和错误告警：

```ts
import { createServer } from 'node:http';
import { exec } from 'node:child_process';

const PORT = 19090;
const REPO_DIR = '/srv/daojie-yusheng';

function run(command: string) {
  return new Promise<void>((resolve, reject) => {
    exec(command, { cwd: REPO_DIR }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve();
    });
  });
}

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/gitee-webhook') {
    res.statusCode = 404;
    res.end('not found');
    return;
  }

  try {
    await run('git pull origin main');
    await run('pnpm install --frozen-lockfile');
    await run('pnpm build');
    await run('docker compose up -d --build');
    res.statusCode = 200;
    res.end('ok');
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : 'deploy failed');
  }
}).listen(PORT);
```

实际落地时建议补上：

- WebHook 签名校验
- 只允许白名单来源访问
- 串行执行，避免多个 push 并发部署
- 日志落盘与失败告警
- `pm2`、`systemd` 或容器守护

## 常见问题

### 为什么已经有 `deploy.yml`，还要 `sync.yml`

`deploy.yml` 是 GitHub 直接构建镜像并部署现有服务器。

`sync.yml` 是把 GitHub 仓库同步一份到 Gitee，方便网络环境更适合访问 Gitee 的服务器自行拉取代码。这两条链路可以并存。

### 什么时候需要 Gitee 令牌

当前这版工作流直接通过 SSH 执行 `git push`，所以不依赖 Gitee API，也不强制要求 `GITEE_TOKEN`。

如果你后续要改回通过 Gitee API 自动建仓，才需要再使用令牌。

### 什么时候会触发同步

默认只有两种情况：

- `push main`
- 在 GitHub Actions 页面手动点击 `Run workflow`

## 相关文件

- [`.github/workflows/sync.yml`](../.github/workflows/sync.yml)
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- [`docs/deploy.md`](./deploy.md)
