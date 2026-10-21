# 全栈部署：GitHub Actions + SSH + FastAPI

这版已经从纯静态页面变为需要 Python 进程的博客。原有 GitHub 仓库与 SSH Secrets 可以沿用；首次上线需在服务器一次性配置持久化目录、服务和反向代理。当前只编写配置，没有执行任何服务器变更或推送。

## 持久化目录

```text
/srv/www/blog/
├── releases/<commit-run-attempt>/
│   ├── backend/
│   ├── frontend/
│   ├── scripts/
│   ├── deploy/
│   └── .venv/
├── current -> releases/<commit-run-attempt>/
└── shared/storage/
    ├── archive.db
    └── uploads/
```

`shared/storage` 不在发布包内，不会随新版本被覆盖。不要把 SQLite 放在 `current` 或 `releases` 下。

## 一次性服务器准备（自行执行）

以 Ubuntu/Debian + systemd + Nginx 为例；其他发行版需要调整安装命令。Python 推荐 3.12，最低 3.10。

1. 安装 Python、venv、pip、Nginx；例如 `sudo apt install python3 python3-venv python3-pip nginx`。
2. 创建运行账户 `blog`（无交互登录），创建 `/srv/www/blog/shared/storage`，将该目录交给 `blog:blog`，权限 `750`。部署用户需拥有 `releases/` 和切换 `current` 的权限；运行账户需能读取发布目录。
3. 将 `deploy/lingxi-blog.service` 放到 `/etc/systemd/system/lingxi-blog.service`。若路径不同，同步修改 `WorkingDirectory`、`ExecStart`、`ReadWritePaths`。
4. 服务器单独创建 `/etc/lingxi-blog.env`，按以下字段填写。**不要把这个文件放到仓库或发布包里。**

```text
ADMIN_TOKEN=首次设定密码时使用的授权口令
STORAGE_DIR=/srv/www/blog/shared/storage
SITE_URL=https://blog.garbager.de
MAX_UPLOAD_MB=16
```

可用 `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'` 在服务器生成口令。环境文件由 root 持有，权限 `600`；systemd 读取后传给服务进程，不要求 `blog` 直接读取文件。

5. 执行 `sudo systemctl daemon-reload` 和 `sudo systemctl enable lingxi-blog`。首次部署前可先不启动，因为当前旧版本还没有后端程序。
6. Actions 的 SSH 部署账户需要能执行 `sudo -n systemctl restart lingxi-blog.service`。使用 `visudo` 仅为这个确切命令配置免密权限，systemctl 的绝对路径以服务器实际位置为准；不要授予通用免密 root Shell。
7. 在 GitHub Variables 中新增 `BACKEND_READY=true`，保留现有 `DEPLOY_ENABLED=true`、`DEPLOY_PATH`、`SSH_PORT` 和四个 SSH Secrets。首次触发 `main` 分支发布，工作流会安装新版本依赖并启动后端。
8. 后端健康后，在原 `blog.garbager.de` 的 HTTPS server 块中合并 `deploy/nginx-blog.conf` 的设置，替换原来的静态 `location /`；保留域名、证书、HTTPS 跳转和其他站点。执行 `sudo nginx -t`，通过后再 `sudo systemctl reload nginx`。

服务只监听 `127.0.0.1:8001`，由 Nginx 代理对外访问；无需开放 8001 公网端口。

## Actions 工作流

- `push main`、PR 和手动触发都会执行前端资源校验、JavaScript 语法检查及 Python API 测试。
- PR 不部署；`main` 需同时满足 `DEPLOY_ENABLED=true` 与 `BACKEND_READY=true` 才部署。
- 上传代码包，在 `releases/` 中解压并建立独立 Python 环境，再切换 `current` 并重启服务。
- 服务健康检查会确认新版本提交号；失败会恢复旧 `current` 并尝试重启旧版本。
- 旧发布版本保留。首次从静态版升级时，旧版本不含后端，回滚后需恢复原 Nginx 静态配置；后续全栈版本之间可正常服务回滚。
- `SITE_URL` 现在由服务器环境文件配置，原 GitHub 同名变量不再是运行时配置来源。

## 上线验收

访问 `/api/health`、`/api/telemetry`、`/admin.html`。首次打开后台先用原 ADMIN_TOKEN 授权设定自己的密码；已有密码时直接登录。登录后可从顶栏修改密码。然后发布一篇文章并上传一张图片，确认首页、正文和 `/rss.xml` 同步变化；再次发布程序，确认文章和图片仍存在。

## 备份

数据库运行时使用 WAL，勿只复制正在写入的 `archive.db` 文件。以存储目录所有者身份设置 `STORAGE_DIR`，运行 `python scripts/backup_storage.py` 使用 SQLite 在线备份；同时备份整个 `uploads/` 目录。备份应移到独立磁盘或其他受控目的地。

## 本次范围

本次登录升级使用现有 GitHub Actions 通路发布；不会替换或清空持久化数据库及上传目录。运行记录以 GitHub Actions 和 /api/health 中的实际版本为准。


## 本次密码迁移

保留现有服务器 ADMIN_TOKEN，无需为了升级修改服务器环境文件。首次新后台会显示“首次设定密码”，用原管理口令授权后输入你自己的新密码。没有公开默认密码。设置完成后，旧 Bearer 口令不能继续操作管理接口。

数据库会自动新增 admin_settings 和 admin_sessions 表，不更改原 posts 数据。密码哈希和会话随 storage 持久化，发布新版本后仍有效。Cookie 在 HTTPS 下自动带 Secure，另有 HttpOnly 与 SameSite=Strict。不要使用反向代理静态缓存管理 API。

如在服务器通过 BLOG_ADMIN_PASS 预置密码，必须8–128字符且仅初始化空配置；后续网页修改的新密码优先，不会在重启时被旧环境值覆盖。

## 设计参考

[OWASP密码存储建议](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)；[Starlette Cookie接口](https://starlette.dev/responses/)。
