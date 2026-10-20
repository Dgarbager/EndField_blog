# 灵犀日志归档库

FastAPI + SQLite 后端与原生 JavaScript 前端。保留双视图终端、开屏自检和三色主题，现已接入真实文章数据。

## 已实现

- `/admin.html`：管理口令连接、Markdown 实时预览、新建/编辑/删除、置顶、封面上传、粘贴截图与拖入传图、文章管理与检索。
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

首次启动会创建 `.venv` 并安装依赖，然后让你输入本地管理口令。口令用于本次服务进程，不会写入 Git 文件。打开 `http://127.0.0.1:8000/admin.html`，输入相同口令即可发文。

只读查看可运行 `./start-local.ps1 -ReadOnly`。未设置 `ADMIN_TOKEN` 时，管理 API 返回 503；没有默认生产密码。

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

后台按草案使用 Bearer 口令，浏览器本地保存口令；共用设备使用后点击“退出并清除”。公网部署使用 HTTPS，且不要把管理口令、`.env`、数据库或上传图片提交到 Git。

## 检查和测试

```powershell
.\.venv\Scripts\python.exe -m pip install -r tests/requirements.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe scripts/validate_site.py
```

前端渲染库已保存在 `frontend/assets/vendor/`，带版本记录和许可证，不依赖外部 CDN。Markdown 输出先经过 DOMPurify，再渲染代码和公式。

## 自行同步部署

代码尚未提交或推送。现有静态部署通路需要升级为 Python 服务，详见 [部署说明](docs/deployment.md)。新版工作流仅在 `DEPLOY_ENABLED=true` **且** `BACKEND_READY=true` 时部署，避免未准备后端的服务器收到不完整发布。

[接口契约](docs/api.md) · [开发与验证记录](docs/verification.md)
