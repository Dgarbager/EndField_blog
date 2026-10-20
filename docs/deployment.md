# GitHub Actions + SSH 部署

网站为纯静态文件，无需 Node 构建或服务端进程。Actions 在校验成功后，通过 SSH 上传独立发布目录，最后原子切换 `current` 符号链接。旧版本保留，便于手动回滚。

## 1. Git 与 GitHub

本地目录已初始化 `main` 分支。创建一个空 GitHub 仓库后，在项目根目录运行：

```powershell
git add .
git commit -m "Initial static blog"
git remote add origin https://github.com/Dgarbager/EndField_blog.git
git push -u origin main
```

首次提交需要已经配置 Git 的用户名和邮箱。请用自己的仓库地址替换占位符。

## 2. 服务器准备

工作流面向 Linux 服务器，需要 Bash、OpenSSH、tar、支持 `mv -T` 的 GNU coreutils。SSH 主机使用域名或 IPv4。部署用户不需要 root，只需对站点目录有写权限。

以下路径只是示例，按服务器实际情况配置：

```text
/srv/www/blog/
├── releases/
│   ├── <commit-run-attempt>/
│   └── <commit-run-attempt>.tar.gz
└── current -> releases/<commit-run-attempt>/
```

由管理员预先创建 `/srv/www/blog` 并授予部署用户写权限。Nginx 或其他静态服务器的网站根目录指向 `/srv/www/blog/current`。

Nginx 的站点配置中可使用：

```nginx
root /srv/www/blog/current;
index index.html;
location / {
    try_files $uri $uri/ =404;
}
```

站点视图使用 `#archive` 地址，因此无需为当前演示配置 SPA 路由回退。域名、HTTPS、Nginx 安装及服务器初始化须在服务器上另外配置。

## 3. SSH 密钥

生成用于部署的专用 SSH 密钥，将公钥加入服务器部署用户的 `~/.ssh/authorized_keys`；私钥只保存到 GitHub Secrets，不能提交到仓库。此工作流使用不带口令的专用部署密钥。

通过服务器控制台或其他可信渠道核对 SSH 主机公钥指纹，再将确认过的 known_hosts 行填入 `SSH_KNOWN_HOSTS`。非 22 端口对应的行应使用 `[主机]:端口` 格式。工作流保持严格主机身份校验。

## 4. GitHub 仓库配置

进入仓库 Settings → Secrets and variables → Actions。

Secrets：

| 名称 | 内容 |
| --- | --- |
| `SSH_HOST` | 服务器域名或 IPv4 |
| `SSH_USER` | 部署用户名 |
| `SSH_PRIVATE_KEY` | 专用部署私钥完整内容 |
| `SSH_KNOWN_HOSTS` | 已核对指纹的服务器主机公钥行 |

Variables：

| 名称 | 内容 |
| --- | --- |
| `DEPLOY_PATH` | 独立站点根目录，例如 `/srv/www/blog`；仅使用字母、数字、下划线、点、连字符及路径分隔符 |
| `SITE_URL` | 公开网站完整地址，例如 `https://blog.example.com`；用于替换 RSS 的预览地址 |
| `SSH_PORT` | SSH 端口，省略时为 `22` |
| `DEPLOY_ENABLED` | 所有配置完成后设为 `true`；省略时只校验，不部署 |

## 5. 日常发布

修改 `public/` 后提交并推送到 `main`，Actions 将执行校验和部署。PR 只运行校验。也可在 Actions 页面手动运行工作流，部署仅允许 `main` 分支。

部署内容只有 `public/` 生成的 `dist/`，不会上传 Git 文件、文档或预览截图。工作流不会自动删除服务器旧版本；需自行制定保留策略。首次部署时如果 `current` 已存在且不是符号链接，流程会停止，不覆盖它。

## 当前完成范围

已整理最新页面、初始化本地 Git、准备工作流与校验脚本。尚未创建 GitHub 仓库、配置远程地址、生成密钥、连接服务器或实际部署。

参考：[GitHub Actions 工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)、[配置 Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)、[官方 checkout](https://github.com/actions/checkout)。
