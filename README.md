# 灵犀日志归档库

最新“三色切换”版本：双视图总控台、三套主题、开屏自检、文章分类、标签筛选、分页和摘要预览。纯静态 HTML / CSS / JavaScript，无需 npm 或构建框架。

## 目录

```text
blog/
├── public/                    # 网站发布内容，服务器只发布此目录
│   ├── index.html
│   ├── rss.xml
│   └── assets/
├── scripts/                   # 校验与发布文件准备
├── .github/workflows/         # GitHub Actions 校验和 SSH 自动部署
├── docs/
│   ├── deployment.md          # GitHub、SSH 与服务器配置说明
│   ├── 界面使用说明.txt
│   └── previews/              # 预览截图，不发布到服务器
├── .gitignore
├── .gitattributes
└── .editorconfig
```

## 本地查看

在仓库根目录运行：

```powershell
python -m http.server 8000 --directory public --bind 127.0.0.1
```

浏览器打开 http://127.0.0.1:8000/ 。也可双击 `public/index.html`。

## 校验

```powershell
python scripts/validate_site.py
```

## 工作流

修改 `public/` → 本地检查 → 提交到 Git → 推送 GitHub 的 `main` 分支 → Actions 校验 → SSH 上传新版本 → 切换服务器的 `current` 链接。

自动部署默认关闭。按 [部署说明](docs/deployment.md) 配置 GitHub Secrets、Variables 和服务器目录后，将 `DEPLOY_ENABLED` 设为 `true` 即可。仓库尚未绑定远程地址，也未发布到服务器。

## 数据状态

当前仍为界面演示，89 LOGS / 142.8K 为草案示例，列表含 4 篇演示摘要，尚未接入真实正文。RSS 的本地预览地址会在部署时按 `SITE_URL` 替换。
