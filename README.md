# 灵犀日志归档库

FastAPI + SQLite 后端与原生 JavaScript 前端。保留双视图终端、开屏自检和三色主题，现已接入真实文章数据。

## 已实现

- `/admin.html`：独立密码登录、首次设定与修改密码、30天免登 Cookie、Markdown 实时预览、新建/编辑/删除、置顶、封面上传、粘贴截图与拖入传图、文章管理与检索。
- `/`：数据库统计、按分类和标签筛选、分页、随机漫游；不再展示虚构文章与统计数字。
- `/post.html?id=1`：完整 Markdown 正文、代码高亮与复制、数学公式、目录及上一篇/下一篇。
- `/rss.xml`：从数据库生成的真实订阅。
- 图片与 SQLite 保存在独立存储目录，部署包只包含程序。

## 目录

```text
blog/
├── backend/                 # FastAPI 单文件服务与依赖
├── frontend/                # 三张页面、主题、脚本与本地渲染库
├── storage/                 # 运行时生成；已忽略，不提交、不打包
│   ├── archive.db
│   └── uploads/YYYY/MM/
├── tests/                   # 真实 API / 数据持久化 / 上传测试
├── scripts/                 # 校验、打包、健康检查、发布与数据库备份
├── deploy/                  # systemd 与 Nginx 模板
├── .github/workflows/       # CI 和全栈发布流程
├── docs/                    # 运行和部署说明
├── .env.example             # 环境变量名称示例，无实际口令
└── start-local.ps1          # Windows 本地启动
```

## 本地运行（Windows）

需要 Python 3.12（最低 3.10）。在 `E:\blog` 运行：

```powershell
.\start-local.ps1
```

首次启动会创建 `.venv` 并安装依赖；尚未设定密码时，输入一次本地初始授权口令。打开 `http://127.0.0.1:8000/admin.html`，在“首次设定密码”中用该口令验证并设定自己的8–128字符密码。之后使用新密码登录，30天内免重复输入。已设定密码的本地库无需再次输入初始口令。

只读查看可运行 `./start-local.ps1 -ReadOnly`。未设置 `ADMIN_TOKEN` 时，管理 API 返回 503；没有默认生产密码。密码设置保存在数据库中，程序重启或部署不会恢复旧密码。

也可手动运行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
$env:ADMIN_TOKEN = Read-Host 'Local admin token'
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

完整功能需要通过后端服务打开，不能继续使用纯静态文件服务器或双击 HTML。

## 数据与口令

默认存储在仓库根目录 `storage/`；生产环境必须设置 `STORAGE_DIR=/srv/www/blog/shared/storage`，与版本目录分开。程序不会自动插入演示文章。删除文章不会删除图片，以免误伤其他文章引用的素材。

后台使用 HttpOnly Cookie，登录态在服务器验证，不把密码或会话 Token 放入 localStorage。密码以PBKDF2-SHA256加盐哈希保存，登录有效期30天；退出撤销当前会话，改密撤销其他设备会话。首次设定必须验证旧 ADMIN_TOKEN，设定完成后旧口令不能绕过密码登录。公网使用 HTTPS，初始口令、`.env`、数据库和上传图片不能提交到 Git。

## 检查和测试

```powershell
.\.venv\Scripts\python.exe -m pip install -r tests/requirements.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe scripts/validate_site.py
```

前端渲染库已保存在 `frontend/assets/vendor/`，带版本记录和许可证，不依赖外部 CDN。Markdown 输出先经过 DOMPurify，再渲染代码和公式。

## 自行同步部署

现有全栈部署通路沿用，详见 [部署说明](docs/deployment.md)。新版工作流仅在 `DEPLOY_ENABLED=true` **且** `BACKEND_READY=true` 时部署，避免未准备后端的服务器收到不完整发布。

[接口契约](docs/api.md) · [开发与验证记录](docs/verification.md)
