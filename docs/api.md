# API contract

所有接口同源，JSON 使用 UTF-8。管理接口需 `Authorization: Bearer <ADMIN_TOKEN>`；后台存储口令后由前端自动附加。没有配置口令时管理端返回503，鉴权失败401。

| 接口 | 行为 |
| --- | --- |
| GET /api/health | 健康状态和发布版本号 |
| GET /api/telemetry | total_docs、total_words、last_update（YYYY.MM.DD或null）、四个sectors数量 |
| GET /api/posts | 参数sector=ALL或SEC_01~04，page>=1，limit=1~100，tag精确匹配，q搜索标题与摘要 |
| GET /api/posts/{id} | 详情，含content_md、prev_post和next_post |
| GET /api/admin/auth | 管理口令有效性检查 |
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
