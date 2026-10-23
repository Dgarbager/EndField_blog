# 三色主题音乐播放器

封面、文章列表和文章阅读页共用左下角播放器。初次打开页面保持静音，点击播放器封面才播放。暂停时切主题只切换待命曲目；播放时切主题使用约 420ms 淡出和 550ms 淡入。音量为用户设置值，0 音量不会在切换主题后被提高。

## 放置音乐文件

目前未附带音乐，不会下载或上传示例歌曲。请将三首 **MP3 音频文件**分别重命名并放入：

```text
E:\blog\storage\uploads\audio\
├── bgm-night.mp3       极夜 NIGHT
├── bgm-day.mp3         白昼 DAY
└── bgm-wuling.mp3      武陵 WULING
```

这是默认本地路径。如果启动时指定了 `STORAGE_DIR`，请放到该目录下的 `uploads/audio/` 中。文件必须是真正的 MP3，不能仅把其他格式的扩展名改成 `.mp3`。

目录由后端启动时自动创建；放好后无需改程序或重启，刷新页面或点击播放器的“重试”即可。可以先只放一首，其他主题会显示“音乐待配置”。音乐加载失败时会暂停并显示重试入口，不会跳到另一种主题的曲目。

生产服务器同样放在 **实际 `STORAGE_DIR` 下的 `uploads/audio/`**，例如既有部署使用 `/srv/www/blog/shared/storage` 时，对应 `/srv/www/blog/shared/storage/uploads/audio/`。音乐属于持久化数据，与文章图片一样，不进入 Git 或代码发布包。仅推送代码不会将本地 MP3 上传到服务器，需要自行传到服务器的存储目录。

这三个固定文件是访客可收听的公开背景音乐。其他文件不会通过音乐接口暴露，也不会改变零号档案的图片权限。

## 修改显示名称

修改 `frontend/assets/music-config.js` 中对应主题的 `name`、`artist`、`cover` 和 `theme`。三个音频文件名固定，由后端的 `MUSIC_FILES` 定义。播放地址由后端返回，无需在前端填写服务器的绝对路径。

## 播放行为

- 原有三色按钮自动联动对应曲目；播放器的主题歌单也可选择配色与曲目；单曲循环、拖动进度和键盘左右方向键快进/快退均可用。
- 每首音乐的进度单独保存于当前标签页的 `sessionStorage`。跨文章页面可恢复进度，但整页跳转会中断音频，新页面仍需点击播放；没有持续跨页播放或自动播放。
- 音量与收起状态保存在本浏览器。移动端默认收起为小封面，右侧把手可展开。
- 浏览器拒绝播放时显示“请点击封面继续播放”；用户主动暂停、快速连续切换主题、文件缺失和加载超时都会取消过期的自动续播。
- 页面离开会暂停并保存进度。后台不停止正在播放的音乐。

## 接口与依赖

- `GET /api/music`：三种主题是否已有非空音频文件，以及带文件版本的播放地址。
- `GET /api/music/night`（或 `day`、`wuling`）：公开播放固定文件；支持 `HEAD`、`Accept-Ranges: bytes` 和 `206 Partial Content`。
- 原有 `/uploads/` 保持图片访问保护；不要把它改成公开静态目录。按既有 Nginx 配置将整站转发给 FastAPI 即可。
- APlayer 1.10.1 来自官方 npm 发布包，SHA-512 校验后保存于 `frontend/assets/vendor/`，附 MIT 许可证和版本信息；不使用 MetingJS、第三方音乐解析 API 或运行时 CDN。
- APlayer 官方文档：<https://github.com/DIYgod/APlayer/blob/master/docs/zh-Hans/README.md>。

## 验证

执行 `python -m pytest -q`、`python scripts/validate_site.py` 和 `node --test tests/test_*.cjs`。音乐接口测试覆盖未配置、固定文件白名单、公开播放、HEAD、分段请求及无关文件不可访问；播放器测试覆盖淡入淡出、进度恢复、快速切换、暂停取消续播、0 音量及播放失败。
