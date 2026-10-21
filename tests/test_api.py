from io import BytesIO
import sqlite3
import xml.etree.ElementTree as ET
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import create_app

TOKEN = 'isolated-test-token-not-a-production-secret'
AUTH = {'Authorization': 'Bearer ' + TOKEN}

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, TOKEN)) as test:
        yield test

def payload(**changes):
    return {'title': '控制系统实验', 'sector': 'SEC_01', 'content_md': '## 方法\n\n' + '算法研究' * 220,
            'tags': 'MATLAB,CONTROL_SYS', **changes}

def create(client, **changes):
    response = client.post('/api/admin/posts', json=payload(**changes), headers=AUTH)
    assert response.status_code == 201, response.text
    return response.json()

def test_initial_empty_and_authentication(client):
    assert client.get('/api/telemetry').json() == {'total_docs': 0, 'total_words': 0, 'last_update': None,
        'sectors': {'SEC_01': 0, 'SEC_02': 0, 'SEC_03': 0, 'SEC_04': 0}}
    assert client.get('/api/posts').json()['items'] == []
    for headers in ({}, {'Authorization': 'Bearer wrong'}):
        assert client.post('/api/admin/posts', json=payload(), headers=headers).status_code == 401
    assert client.get('/api/admin/auth', headers=AUTH).status_code == 200

def test_crud_summary_telemetry_and_neighbors(client):
    first = create(client)
    second = create(client, title='工程归档', sector='SEC_02')
    pinned = create(client, title='置顶归档', is_pinned=True)
    listing = client.get('/api/posts').json()
    assert [x['id'] for x in listing['items']] == [pinned['id'], second['id'], first['id']]
    assert all('content_md' not in x for x in listing['items'])
    assert first['word_count'] > 800 and first['read_time'] == 3
    assert 0 < len(first['excerpt']) <= 100
    assert client.get(f'/api/posts/{second["id"]}').json()['prev_post']['id'] == pinned['id']
    assert client.get(f'/api/posts/{second["id"]}').json()['next_post']['id'] == first['id']
    changed = client.put(f'/api/admin/posts/{first["id"]}', json=payload(title='已更新', content_md='新的正文', sector='SEC_04'), headers=AUTH)
    assert changed.status_code == 200
    assert changed.json()['created_at'] == first['created_at']
    assert changed.json()['word_count'] == 4
    stats = client.get('/api/telemetry').json()
    assert stats['total_docs'] == 2 and stats['sectors']['SEC_04'] == 0
    assert len(stats['last_update']) == 10
    assert client.delete(f'/api/admin/posts/{second["id"]}', headers=AUTH).status_code == 204
    assert client.get(f'/api/posts/{second["id"]}').status_code == 404
    assert client.get('/api/telemetry').json()['total_docs'] == 1
    assert client.delete('/api/admin/posts/9999', headers=AUTH).status_code == 404

def test_filter_pagination_and_validation(client):
    create(client, tags=' GA,GA, MAT, #MATLAB ', is_pinned=True)
    create(client, sector='SEC_02', tags='MATLAB_TOOL')
    create(client, sector='SEC_01', tags='MATLAB')
    assert client.get('/api/posts?tag=matlab').json()['total'] == 2
    assert client.get('/api/posts?tag=mat').json()['total'] == 1
    assert client.get('/api/posts?sector=SEC_01&tag=MATLAB').json()['total'] == 2
    assert client.get('/api/posts?limit=1&page=999').json()['page'] == 3
    assert client.get('/api/posts?q=%27%20OR%201%3D1').json()['total'] == 0
    assert client.get('/api/posts?page=0').status_code == 422
    assert client.get('/api/posts?limit=101').status_code == 422
    assert client.get('/api/posts?sector=BAD').status_code == 422
    for changes in [{'title':' '}, {'content_md':' '}, {'sector':'BAD'}, {'cover_url':'javascript:alert(1)'}, {'cover_url':'//evil.example/image.png'}, {'cover_url':'/uploads/../archive.db'}]:
        assert client.post('/api/admin/posts', json=payload(**changes), headers=AUTH).status_code == 422

def png():
    buffer=BytesIO();Image.new('RGB',(12,12),(255,208,0)).save(buffer,format='PNG');return buffer.getvalue()

def test_upload_persistence_and_validation(client):
    assert client.post('/api/admin/upload',files={'file':('photo.png',png(),'image/png')}).status_code == 401
    response = client.post('/api/admin/upload', headers=AUTH, files={'file':('../../photo.png',png(),'image/png')})
    assert response.status_code == 201, response.text
    url = response.json()['url'];assert url.startswith('/uploads/') and '..' not in url
    assert client.get(url).content == png()
    assert client.post('/api/admin/upload',headers=AUTH,files={'file':('fake.png',b'<script>alert(1)</script>','image/png')}).status_code == 415
    assert client.post('/api/admin/upload',headers=AUTH,files={'file':('bad.jpg',png(),'image/jpeg')}).status_code == 415
    assert client.post('/api/admin/upload',headers=AUTH,files={'file':('x.svg',b'<svg/>','image/svg+xml')}).status_code == 415
    assert client.get('/storage/archive.db').status_code == 404
    assert client.get('/backend/main.py').status_code == 404

def test_upload_size_limit(tmp_path,monkeypatch):
    monkeypatch.setenv('MAX_UPLOAD_MB','1')
    with TestClient(create_app(tmp_path,TOKEN)) as test:
        response=test.post('/api/admin/upload',headers=AUTH,files={'file':('big.png',b'x'*(1024*1024+1),'image/png')})
        assert response.status_code == 413
        assert not list((tmp_path/'uploads').rglob('IMG_*'))

def test_unconfigured_admin_fails_closed(tmp_path):
    with TestClient(create_app(tmp_path,'')) as test:
        assert test.get('/api/admin/auth',headers=AUTH).status_code == 503
        assert test.get('/api/posts').status_code == 200

def test_content_survives_restart_and_uploads(tmp_path):
    with TestClient(create_app(tmp_path,TOKEN)) as first:
        item=create(first)
        url=first.post('/api/admin/upload',headers=AUTH,files={'file':('p.png',png(),'image/png')}).json()['url']
    with TestClient(create_app(tmp_path,TOKEN)) as second:
        assert second.get(f'/api/posts/{item["id"]}').json()['title']==item['title']
        assert second.get(url).content==png()
        assert second.get('/api/telemetry').json()['total_docs']==1

def test_real_rss_and_site_pages(client,monkeypatch):
    monkeypatch.setenv('SITE_URL','https://blog.example.com')
    item=create(client,title='A < B & C')
    root=ET.fromstring(client.get('/rss.xml').content)
    assert root.findtext('channel/item/title')=='A < B & C'
    assert root.findtext('channel/item/link')==f'https://blog.example.com/post.html?id={item["id"]}'
    for path in ['/', '/admin.html', '/post.html', '/assets/vendor/marked.js']:
        response=client.get(path);assert response.status_code==200,path
    assert client.get('/admin.html').headers['cache-control']=='no-store'
    assert "script-src 'self'" in client.get('/').headers['content-security-policy']
