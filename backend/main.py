"""Lingxi Archive API. Content lives in STORAGE_DIR, never in release folders."""
from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
import math
import hashlib
import time
import threading
from collections import defaultdict, deque
import os
import re
import secrets
import sqlite3
import warnings
import xml.etree.ElementTree as ET

from fastapi import Depends, FastAPI, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import Response, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator

BASE_DIR = Path(__file__).resolve().parents[1]
SECTORS = ('SEC_01', 'SEC_02', 'SEC_03', 'SEC_04')
TZ = timezone(timedelta(hours=8))
IMAGE_TYPES = {'PNG': '.png', 'JPEG': '.jpg', 'WEBP': '.webp', 'GIF': '.gif'}
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}
Image.MAX_IMAGE_PIXELS = 40_000_000
security = HTTPBearer(auto_error=False)
SUMMARY_COLUMNS = 'id,title,sector,excerpt,tags,cover_url,word_count,read_time,is_pinned,created_at,updated_at'


def timestamp():
    return datetime.now(TZ).isoformat(timespec='seconds')


def text_from_markdown(markdown: str) -> str:
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', markdown)
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'<[^>]+>', '', text)
    return re.sub(r'\s+', ' ', re.sub(r'[`#>*_~]', '', text)).strip()


def normalize_tags(value: str) -> str:
    tags = []
    for token in value.replace('，', ',').split(','):
        token = token.strip().lstrip('#').strip()
        if not token:
            continue
        if len(token) > 48 or any(c in token for c in '\r\n<>'):
            raise ValueError('标签长度不得超过48字，且不能含换行或HTML符号')
        if token.casefold() not in {x.casefold() for x in tags}:
            tags.append(token)
    if len(tags) > 24:
        raise ValueError('最多24个标签')
    return ','.join(tags)



SESSION_COOKIE = 'lingxi_admin_session'
SESSION_SECONDS = 30 * 24 * 60 * 60
PASSWORD_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), PASSWORD_ITERATIONS).hex()
    return f'pbkdf2_sha256${PASSWORD_ITERATIONS}${salt}${digest}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split('$')
        if algorithm != 'pbkdf2_sha256':
            return False
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations)).hex()
        return secrets.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


class LoginInput(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class PasswordInput(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator('new_password')
    @classmethod
    def not_blank_password(cls, value):
        if not value.strip():
            raise ValueError('密码不能全为空格')
        return value


class SetupInput(PasswordInput):
    setup_token: str = Field(min_length=1, max_length=4096)


class ChangePasswordInput(PasswordInput):
    current_password: str = Field(min_length=1, max_length=128)


class PostInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    sector: Literal['SEC_01', 'SEC_02', 'SEC_03', 'SEC_04']
    excerpt: str = Field(default='', max_length=1000)
    content_md: str = Field(min_length=1, max_length=1_000_000)
    tags: str = Field(default='', max_length=1500)
    cover_url: str = Field(default='', max_length=2000)
    is_pinned: bool = False

    @field_validator('title', 'content_md')
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError('标题和正文不能为空')
        return value.strip()

    @field_validator('tags')
    @classmethod
    def valid_tags(cls, value):
        return normalize_tags(value)

    @field_validator('cover_url')
    @classmethod
    def valid_cover(cls, value):
        value = value.strip()
        if not value:
            return ''
        parsed = urlsplit(value)
        local = value.startswith('/uploads/') and not parsed.netloc and '..' not in value.split('/')
        remote = parsed.scheme == 'https' and parsed.netloc and not parsed.username and not parsed.password
        if not local and not remote:
            raise ValueError('封面须为上传图片路径或HTTPS图片地址')
        return value


def create_app(storage_dir: str | Path | None = None, admin_token: str | None = None) -> FastAPI:
    storage = Path(storage_dir or os.environ.get('STORAGE_DIR', BASE_DIR / 'storage')).resolve()
    frontend = BASE_DIR / 'frontend'
    token = os.environ.get('ADMIN_TOKEN', '') if admin_token is None else admin_token
    max_upload = int(os.environ.get('MAX_UPLOAD_MB', '16')) * 1024 * 1024
    if max_upload < 1:
        raise ValueError('MAX_UPLOAD_MB must be positive')

    @contextmanager
    def connect():
        db = sqlite3.connect(storage / 'archive.db', timeout=20)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA busy_timeout=20000')
        try:
            with db:
                yield db
        finally:
            db.close()

    def initialize():
        storage.mkdir(parents=True, exist_ok=True)
        (storage / 'uploads').mkdir(exist_ok=True)
        with connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('''CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL, sector TEXT NOT NULL,
                excerpt TEXT NOT NULL DEFAULT '', content_md TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '', cover_url TEXT NOT NULL DEFAULT '',
                word_count INTEGER NOT NULL DEFAULT 0, read_time INTEGER NOT NULL DEFAULT 1,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )''')
            db.execute('CREATE INDEX IF NOT EXISTS posts_order ON posts(is_pinned DESC,id DESC)')
            db.execute('CREATE INDEX IF NOT EXISTS posts_sector ON posts(sector)')
            db.execute('CREATE TABLE IF NOT EXISTS admin_settings (id INTEGER PRIMARY KEY CHECK(id=1), password_hash TEXT NOT NULL, updated_at TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at)')
            initial_password = os.environ.get('BLOG_ADMIN_PASS', '')
            if initial_password and not db.execute('SELECT 1 FROM admin_settings WHERE id=1').fetchone():
                if len(initial_password) < 8 or len(initial_password) > 128 or not initial_password.strip():
                    raise ValueError('BLOG_ADMIN_PASS must contain 8 to 128 characters')
                db.execute('INSERT OR IGNORE INTO admin_settings VALUES (1,?,?)', (hash_password(initial_password), timestamp()))


    @asynccontextmanager
    async def lifespan(app):
        initialize()
        yield

    app = FastAPI(title='Lingxi Archive', version='1.0.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.storage = storage

    failures = defaultdict(deque)
    attempts_lock = threading.Lock()

    def throttle(request: Request, scope: str):
        identity = request.client.host if request.client else 'unknown'
        key = (scope, identity)
        now = time.time()
        with attempts_lock:
            queue = failures[key]
            while queue and queue[0] < now - 300:
                queue.popleft()
            if len(queue) >= 8:
                raise HTTPException(429, '尝试次数过多，请5分钟后重试', headers={'Retry-After': '300'})
        return key

    def failed(key):
        with attempts_lock:
            failures[key].append(time.time())

    def succeeded(key):
        with attempts_lock:
            failures.pop(key, None)

    def configured():
        with connect() as db:
            return db.execute('SELECT password_hash FROM admin_settings WHERE id=1').fetchone()

    def session_record(request: Request):
        raw = request.cookies.get(SESSION_COOKIE, '')
        if not raw or len(raw) > 128:
            return None
        digest = hashlib.sha256(raw.encode()).hexdigest()
        with connect() as db:
            return db.execute('SELECT token_hash,expires_at FROM admin_sessions WHERE token_hash=? AND expires_at>?', (digest, int(time.time()))).fetchone()

    def require_session(request: Request):
        record = session_record(request)
        if not record:
            raise HTTPException(401, '登录已失效，请重新登录')
        return record

    def require_admin(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(security)):
        if session_record(request):
            return
        # Existing automation remains available only until the initial password is set.
        # Once configured, the old bootstrap token cannot bypass login or password changes.
        if configured():
            raise HTTPException(401, '请先登录管理后台')
        if not token:
            raise HTTPException(503, '请先在服务器配置 ADMIN_TOKEN 以授权首次设定密码')
        if not credentials or not secrets.compare_digest(credentials.credentials.encode(), token.encode()):
            raise HTTPException(401, '管理口令无效', headers={'WWW-Authenticate': 'Bearer'})

    def new_session(db):
        raw = secrets.token_urlsafe(32)
        expires = int(time.time()) + SESSION_SECONDS
        db.execute('DELETE FROM admin_sessions WHERE expires_at<=?', (int(time.time()),))
        db.execute('INSERT INTO admin_sessions VALUES (?,?,?)', (hashlib.sha256(raw.encode()).hexdigest(), expires, timestamp()))
        return raw, expires

    def cookie_response(request: Request, raw: str, expires: int, **extra):
        response = JSONResponse({'authenticated': True, 'expires_at': expires, **extra})
        response.set_cookie(SESSION_COOKIE, raw, max_age=SESSION_SECONDS, expires=datetime.fromtimestamp(expires, timezone.utc),
                            httponly=True, secure=request.url.scheme == 'https', samesite='strict', path='/api/admin')
        return response

    @app.middleware('http')
    async def security_headers(request: Request, call_next):
        content_length = request.headers.get('content-length')
        if content_length and (not content_length.isdigit() or int(content_length) > max_upload + 1024 * 1024):
            return JSONResponse({'detail': '请求内容过大'}, status_code=413)
        if request.method in ('POST', 'PUT', 'DELETE', 'PATCH') and request.url.path.startswith('/api/admin/'):
            origin = request.headers.get('origin')
            expected = f'{request.url.scheme}://{request.url.netloc}'
            allowed = {expected, os.environ.get('SITE_URL', '').rstrip('/')}
            if origin and origin not in allowed:
                return JSONResponse({'detail': '不允许跨站管理请求'}, status_code=403)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; "
            "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        )
        if request.url.path.startswith('/api/') or request.url.path in ('/admin.html', '/post.html', '/', '/index.html'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/api/health')
    def health():
        with connect() as db:
            db.execute('SELECT 1').fetchone()
        return {'status': 'ok', 'version': os.environ.get('RELEASE_ID') or ((BASE_DIR / 'RELEASE').read_text(encoding='utf-8').strip() if (BASE_DIR / 'RELEASE').is_file() else 'local')}

    @app.get('/api/admin/auth', dependencies=[Depends(require_admin)])
    def check_auth():
        return {'authenticated': True}

    @app.get('/api/admin/auth/status')
    def auth_status():
        return {'password_configured': bool(configured()), 'setup_available': bool(token)}

    @app.get('/api/admin/session')
    def check_session(request: Request):
        session = require_session(request)
        return {'authenticated': True, 'expires_at': session['expires_at']}

    @app.post('/api/admin/setup')
    def setup_password(payload: SetupInput, request: Request):
        key = throttle(request, 'setup')
        if configured():
            raise HTTPException(409, '已设定密码，请使用登录后的修改密码功能')
        if not token:
            raise HTTPException(503, '服务器未配置首次授权口令 ADMIN_TOKEN')
        if not secrets.compare_digest(payload.setup_token.encode(), token.encode()):
            failed(key)
            raise HTTPException(401, '原管理口令不正确')
        encoded = hash_password(payload.new_password)
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM admin_settings WHERE id=1').fetchone():
                raise HTTPException(409, '密码已设定，请登录')
            db.execute('INSERT INTO admin_settings VALUES (1,?,?)', (encoded, timestamp()))
            raw, expires = new_session(db)
        succeeded(key)
        return cookie_response(request, raw, expires, password_set=True)

    @app.post('/api/admin/login')
    def login(payload: LoginInput, request: Request):
        key = throttle(request, 'login')
        settings = configured()
        if not settings:
            raise HTTPException(409, '请先设定管理员密码')
        encoded = settings['password_hash']
        if not verify_password(payload.password, encoded):
            failed(key)
            raise HTTPException(401, '密码不正确')
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = db.execute('SELECT password_hash FROM admin_settings WHERE id=1').fetchone()
            if not secrets.compare_digest(encoded, current['password_hash']):
                raise HTTPException(401, '密码已变更，请重新登录')
            raw, expires = new_session(db)
        succeeded(key)
        return cookie_response(request, raw, expires)

    @app.post('/api/admin/logout')
    def logout(request: Request):
        raw = request.cookies.get(SESSION_COOKIE, '')
        if raw:
            with connect() as db:
                db.execute('DELETE FROM admin_sessions WHERE token_hash=?', (hashlib.sha256(raw.encode()).hexdigest(),))
        response = JSONResponse({'authenticated': False})
        response.delete_cookie(SESSION_COOKIE, path='/api/admin', httponly=True, secure=request.url.scheme == 'https', samesite='strict')
        return response

    @app.put('/api/admin/password')
    def change_password(payload: ChangePasswordInput, request: Request):
        session = require_session(request)
        key = throttle(request, 'password')
        encoded = configured()['password_hash']
        if not verify_password(payload.current_password, encoded):
            failed(key)
            raise HTTPException(400, '当前密码不正确')
        if secrets.compare_digest(payload.current_password.encode(), payload.new_password.encode()):
            raise HTTPException(422, '新密码须与当前密码不同')
        new_hash = hash_password(payload.new_password)
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = db.execute('SELECT password_hash FROM admin_settings WHERE id=1').fetchone()
            still_valid = db.execute('SELECT 1 FROM admin_sessions WHERE token_hash=? AND expires_at>?', (session['token_hash'], int(time.time()))).fetchone()
            if not still_valid or not secrets.compare_digest(encoded, current['password_hash']):
                raise HTTPException(401, '登录状态已变更，请重新登录')
            db.execute('UPDATE admin_settings SET password_hash=?,updated_at=? WHERE id=1', (new_hash, timestamp()))
            db.execute('DELETE FROM admin_sessions')
            raw, expires = new_session(db)
        succeeded(key)
        return cookie_response(request, raw, expires, password_changed=True)

    @app.get('/api/telemetry')
    def telemetry():
        with connect() as db:
            row = db.execute('''SELECT COUNT(*) AS total_docs,COALESCE(SUM(word_count),0) AS total_words,
                MAX(updated_at) AS last_update,
                COALESCE(SUM(sector='SEC_01'),0) AS sec1,COALESCE(SUM(sector='SEC_02'),0) AS sec2,
                COALESCE(SUM(sector='SEC_03'),0) AS sec3,COALESCE(SUM(sector='SEC_04'),0) AS sec4 FROM posts''').fetchone()
        return {'total_docs': row['total_docs'], 'total_words': row['total_words'],
                'last_update': row['last_update'][:10].replace('-', '.') if row['last_update'] else None,
                'sectors': dict(zip(SECTORS, [row['sec1'], row['sec2'], row['sec3'], row['sec4']]))}

    @app.get('/api/posts')
    def list_posts(sector: str = 'ALL', page: int = Query(1, ge=1), limit: int = Query(10, ge=1, le=100),
                   tag: str = Query('', max_length=48), q: str = Query('', max_length=200)):
        if sector not in ('ALL', *SECTORS):
            raise HTTPException(422, '无效的扇区')
        conditions, args = [], []
        if sector != 'ALL':
            conditions.append('sector=?'); args.append(sector)
        if tag.strip().lstrip('#'):
            conditions.append("instr(',' || lower(tags) || ',', ',' || lower(?) || ',') > 0")
            args.append(tag.strip().lstrip('#'))
        if q.strip():
            conditions.append('(instr(lower(title),lower(?))>0 OR instr(lower(excerpt),lower(?))>0)')
            args.extend([q.strip(), q.strip()])
        where = (' WHERE ' + ' AND '.join(conditions)) if conditions else ''
        with connect() as db:
            total = db.execute('SELECT COUNT(*) FROM posts' + where, args).fetchone()[0]
            pages = max(1, math.ceil(total / limit)); actual = min(page, pages)
            rows = db.execute(f'SELECT {SUMMARY_COLUMNS} FROM posts' + where + ' ORDER BY is_pinned DESC,id DESC LIMIT ? OFFSET ?',
                              [*args, limit, (actual - 1) * limit]).fetchall()
        return {'items': [dict(row) for row in rows], 'total': total, 'page': actual, 'limit': limit, 'pages': pages}

    @app.get('/api/posts/{post_id}')
    def get_post(post_id: int):
        with connect() as db:
            row = db.execute('SELECT * FROM posts WHERE id=?', (post_id,)).fetchone()
            if not row:
                raise HTTPException(404, '文章不存在或已删除')
            ordered = db.execute('SELECT id,title FROM posts ORDER BY is_pinned DESC,id DESC').fetchall()
        result = dict(row)
        position = next(i for i, item in enumerate(ordered) if item['id'] == post_id)
        result['prev_post'] = dict(ordered[position - 1]) if position > 0 else None
        result['next_post'] = dict(ordered[position + 1]) if position + 1 < len(ordered) else None
        return result

    def values(post: PostInput):
        plain = text_from_markdown(post.content_md)
        count = len(re.sub(r'\s', '', plain))
        return (post.title, post.sector, post.excerpt.strip() or plain[:100], post.content_md,
                post.tags, post.cover_url, count, max(1, math.ceil(count / 400)), int(post.is_pinned))

    @app.post('/api/admin/posts', status_code=201, dependencies=[Depends(require_admin)])
    def create_post(post: PostInput):
        now = timestamp()
        with connect() as db:
            cursor = db.execute('''INSERT INTO posts(title,sector,excerpt,content_md,tags,cover_url,word_count,read_time,is_pinned,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)''', (*values(post), now, now))
            post_id = cursor.lastrowid
        return get_post(post_id)

    @app.put('/api/admin/posts/{post_id}', dependencies=[Depends(require_admin)])
    def update_post(post_id: int, post: PostInput):
        with connect() as db:
            cursor = db.execute('''UPDATE posts SET title=?,sector=?,excerpt=?,content_md=?,tags=?,cover_url=?,word_count=?,read_time=?,is_pinned=?,updated_at=? WHERE id=?''',
                                (*values(post), timestamp(), post_id))
            if cursor.rowcount == 0:
                raise HTTPException(404, '文章不存在或已删除')
        return get_post(post_id)

    @app.delete('/api/admin/posts/{post_id}', status_code=204, dependencies=[Depends(require_admin)])
    def delete_post(post_id: int):
        with connect() as db:
            cursor = db.execute('DELETE FROM posts WHERE id=?', (post_id,))
            if cursor.rowcount == 0:
                raise HTTPException(404, '文章不存在或已删除')
        return Response(status_code=204)

    @app.post('/api/admin/upload', status_code=201, dependencies=[Depends(require_admin)])
    async def upload(file: UploadFile = File(...)):
        extension = Path(file.filename or '').suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(415, '仅支持 PNG、JPG、WEBP、GIF 图片')
        data = bytearray()
        try:
            while chunk := await file.read(64 * 1024):
                data.extend(chunk)
                if len(data) > max_upload:
                    raise HTTPException(413, f'图片最大 {max_upload // 1024 // 1024} MB')
        finally:
            await file.close()
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(BytesIO(data)) as image:
                    actual_format = image.format
                    image.verify()
            if actual_format not in IMAGE_TYPES:
                raise ValueError('Unsupported image')
            expected = IMAGE_TYPES[actual_format]
            if extension != expected and not (extension == '.jpeg' and expected == '.jpg'):
                raise ValueError('File extension does not match content')
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise HTTPException(415, '图片内容损坏、尺寸过大或与扩展名不符')
        now = datetime.now(TZ)
        directory = storage / 'uploads' / now.strftime('%Y/%m')
        directory.mkdir(parents=True, exist_ok=True)
        name = f'IMG_{now:%Y%m%d}_{secrets.token_hex(12)}{expected}'
        destination = directory / name
        try:
            with destination.open('xb') as output:
                output.write(data)
        except OSError:
            raise HTTPException(500, '图片保存失败，请检查存储空间和目录权限')
        return {'url': f'/uploads/{now:%Y/%m}/{name}'}

    @app.get('/rss.xml')
    def rss(request: Request):
        site = os.environ.get('SITE_URL', str(request.base_url)).rstrip('/')
        document = ET.Element('rss', version='2.0'); channel = ET.SubElement(document, 'channel')
        for key, value in [('title', '灵犀日志归档库'), ('link', site), ('description', '最新归档日志')]:
            ET.SubElement(channel, key).text = value
        with connect() as db:
            rows = db.execute(f'SELECT {SUMMARY_COLUMNS} FROM posts ORDER BY id DESC LIMIT 50').fetchall()
        for row in rows:
            item = ET.SubElement(channel, 'item')
            ET.SubElement(item, 'title').text = row['title']
            url = f'{site}/post.html?id={row["id"]}'
            ET.SubElement(item, 'link').text = url
            ET.SubElement(item, 'guid', isPermaLink='true').text = url
            ET.SubElement(item, 'description').text = row['excerpt']
        return Response(ET.tostring(document, encoding='utf-8', xml_declaration=True), media_type='application/rss+xml')

    # Directory is created during lifespan, not copied into each release.
    app.mount('/uploads', StaticFiles(directory=storage / 'uploads', check_dir=False), name='uploads')
    app.mount('/', StaticFiles(directory=frontend, html=True), name='frontend')
    return app


app = create_app()
