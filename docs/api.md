# API contract

所有接口同源，JSON 使用 UTF-8。管理接口使用登录接口下发的 HttpOnly Cookie，固定30天有效。首次设定密码前可用旧 `Authorization: Bearer <ADMIN_TOKEN>` 兼容原集成；设定后禁用旧口令绕过。未配置初始口令且无已设定密码时，首次设定返回503。

| 接口 | 行为 |
| --- | --- |
| GET /api/health | 健康状态和发布版本号 |
| GET /api/telemetry | total_docs、total_words、last_update（YYYY.MM.DD或null）、四个sectors数量 |
| GET /api/posts | 参数sector=ALL或SEC_01~04，page>=1，limit=1~100，tag精确匹配，q搜索标题与摘要 |
| GET /api/posts/{id} | 详情，含content_md、prev_post和next_post |
| GET /api/admin/auth/status | 是否已设定密码、是否可首次授权，不返回秘密 |
| GET /api/admin/session | Cookie会话验证，返回expires_at |
| POST /api/admin/setup | setup_token + new_password；首次设定并登录，已设定返回409 |
| POST /api/admin/login | password；验证后下发HttpOnly Cookie |
| POST /api/admin/logout | 撤销当前会话并清除Cookie |
| PUT /api/admin/password | current_password + new_password；改密并撤销其他会话，保留当前会话 |
| GET /api/admin/auth | 兼容管理鉴权检查 |
| POST /api/admin/posts | 新建文章，成功201并返回完整详情 |
| PUT /api/admin/posts/{id} | 更新文章，保留created_at，成功200 |
| DELETE /api/admin/posts/{id} | 删除记录，成功204；图片保留 |
| POST /api/admin/upload | multipart的file字段，返回201和`{url:"/uploads/YYYY/MM/IMG_...png"}` |
| GET /rss.xml | 数据库生成的RSS，最新50条 |

列表返回：

```json
{"items":[],"total":0,"page":1,"limit":10,"pages":1}
```

列表不包含content_md，按is_pinned DESC、id DESC排序。页码超过最后一页时返回最后一页；筛选结果为空时为第1页。

写入字段：title、sector、content_md必填；excerpt、tags（逗号分隔）、cover_url、is_pinned可选。摘要留空自动取正文纯文本前100字符。字数按去除Markdown控制符后的非空白字符统计，阅读时间按每400字符一分钟向上取整，最少1分钟。

上传仅接受PNG、JPG/JPEG、WEBP、GIF，默认16MB，校验实际图片内容与扩展名，不接收SVG。图片保留原格式，按年月落盘并使用随机文件名；不会擅自把JPG改后缀伪装WEBP。尺寸过大、扩展名不匹配、损坏文件返回415，大小超限413。

安全与错误：参数校验422、不存在404。封面只允许本站/uploads路径或HTTPS地址。数据库和后台源代码不会从静态目录公开。后台口令应配合HTTPS使用。

密码长度8–128字符，原样比对，不自动去除密码两端空格；当前密码验证失败400、未登录401、参数不符422。5分钟内连续8次登录失败会限流429。默认无公开密码。配置 BLOG_ADMIN_PASS 时只在尚未设定密码的库中初始化一次，后续改密不会被环境变量覆盖。
