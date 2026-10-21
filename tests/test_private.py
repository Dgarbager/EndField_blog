from io import BytesIO
import sqlite3
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import create_app, SESSION_COOKIE

TOKEN='isolated-private-bootstrap'
PASSWORD='isolated-private-password'

@pytest.fixture
def clients(tmp_path,monkeypatch):
    monkeypatch.delenv('BLOG_ADMIN_PASS',raising=False)
    app=create_app(tmp_path,TOKEN)
    with TestClient(app) as admin,TestClient(app) as anonymous:
        assert admin.post('/api/admin/setup',json={'setup_token':TOKEN,'new_password':PASSWORD}).status_code==200
        yield admin,anonymous,tmp_path

def payload(sector='SEC_04',**changes):
    return {'title':'PRIVATE_SECRET_TITLE','sector':sector,'content_md':'PRIVATE_SECRET_BODY','excerpt':'PRIVATE_SECRET_EXCERPT','tags':'secret-tag',**changes}

def post(admin,sector='SEC_04',**changes):
    response=admin.post('/api/admin/posts',json=payload(sector,**changes))
    assert response.status_code==201,response.text
    return response.json()

def upload(admin,private=True):
    buffer=BytesIO();Image.new('RGB',(16,16),'#278a91').save(buffer,format='PNG')
    response=admin.post('/api/admin/upload?archive='+('private' if private else 'public'),files={'file':('photo.png',buffer.getvalue(),'image/png')})
    assert response.status_code==201,response.text
    return response.json()['url']

def test_public_surfaces_never_include_private_records_even_when_logged_in(clients):
    admin,anonymous,_=clients
    public=post(admin,'SEC_01',title='PUBLIC',content_md='public',excerpt='public',tags='public-tag')
    secret=post(admin,is_pinned=True)
    for client in (admin,anonymous):
        for query in ('','?q=PRIVATE_SECRET','?tag=secret-tag','?sector=SEC_04','?page=99&limit=1'):
            response=client.get('/api/posts'+query)
            assert response.status_code==200 and 'PRIVATE_SECRET' not in response.text
        assert client.get('/api/posts').json()['total']==1
        assert client.get('/api/posts?sector=SEC_04').json()['total']==0
        assert client.get('/api/posts/'+str(secret['id'])).status_code==404
        detail=client.get('/api/posts/'+str(public['id'])).json()
        assert detail['prev_post'] is None and detail['next_post'] is None
        stats=client.get('/api/telemetry').json()
        assert stats['total_docs']==1 and stats['total_words']==public['word_count'] and stats['sectors']['SEC_04']==0
        assert 'PRIVATE_SECRET' not in client.get('/rss.xml').text
    assert admin.get('/api/admin/posts').json()['total']==2
    assert admin.get('/api/admin/private/posts').json()['total']==1
    assert admin.get('/api/admin/private/telemetry').json()['total_docs']==1

def test_private_routes_require_real_admin_session(clients):
    admin,anonymous,_=clients
    secret=post(admin)
    for path in ('/api/admin/private/posts','/api/admin/private/telemetry','/api/admin/private/posts/'+str(secret['id']),'/api/admin/posts','/api/admin/posts/'+str(secret['id'])):
        assert anonymous.get(path).status_code==401
        assert anonymous.get(path,headers={'Authorization':'Bearer '+TOKEN}).status_code==401
        assert admin.get(path).status_code==200
    public=post(admin,'SEC_03')
    assert admin.get('/api/admin/private/posts/'+str(public['id'])).status_code==404
    admin.post('/api/admin/logout')
    assert admin.get('/api/admin/private/posts').status_code==401

def test_private_uploads_protected_before_and_after_attachment(clients):
    admin,anonymous,_=clients
    url=upload(admin)
    public_url=url.replace('/api/admin/files/','/uploads/')
    assert anonymous.get(public_url).status_code==404
    assert anonymous.get(url).status_code==401
    assert admin.get(url).status_code==200
    assert admin.get(url).headers['cache-control']=='no-store'
    saved=post(admin,content_md=f'![private]({public_url})',cover_url=public_url)
    assert saved['cover_url']==url and url in saved['content_md']
    assert anonymous.get(public_url).status_code==404
    assert anonymous.get(public_url.replace('/uploads/','/uploads/%2e/')).status_code==404
    assert admin.get('/api/admin/files/../../archive.db').status_code in (401,404)
    admin.delete('/api/admin/posts/'+str(saved['id']))
    assert anonymous.get(public_url).status_code==404

def test_visibility_switch_rewrites_images_and_revokes_public_access(clients):
    admin,anonymous,_=clients
    url=upload(admin,False)
    item=post(admin,'SEC_02',content_md=f'![cover]({url})',cover_url=url)
    assert anonymous.get(url).status_code==200
    response=admin.put('/api/admin/posts/'+str(item['id']),json=payload(content_md=f'![cover]({url})',cover_url=url))
    assert response.status_code==200
    private_url=response.json()['cover_url'];assert private_url.startswith('/api/admin/files/')
    assert anonymous.get(url).status_code==404 and anonymous.get(private_url).status_code==401
    assert anonymous.get('/api/posts/'+str(item['id'])).status_code==404
    response=admin.put('/api/admin/posts/'+str(item['id']),json=payload('SEC_03',content_md=f'![cover]({private_url})',cover_url=private_url))
    assert response.json()['cover_url']==url and url in response.json()['content_md']
    assert anonymous.get(url).status_code==200
    assert anonymous.get('/api/posts/'+str(item['id'])).status_code==200

def test_shared_images_follow_public_references_and_private_neighbors(clients):
    admin,anonymous,_=clients
    url=upload(admin)
    first=post(admin,cover_url=url)
    second=post(admin,title='SECOND_PRIVATE')
    public=post(admin,'SEC_01',cover_url=url)
    public_url=url.replace('/api/admin/files/','/uploads/')
    assert anonymous.get(public_url).status_code==200
    detail=admin.get('/api/admin/private/posts/'+str(second['id'])).json()
    assert detail['prev_post'] is None and detail['next_post']['id']==first['id']
    admin.delete('/api/admin/posts/'+str(public['id']))
    assert anonymous.get(public_url).status_code==404

def test_legacy_sector_four_and_images_migrate_without_losing_content(clients):
    admin,anonymous,storage=clients
    url=upload(admin,False)
    item=post(admin,'SEC_01',cover_url=url,content_md=f'![legacy]({url})')
    raw=admin.cookies.get(SESSION_COOKIE)
    with sqlite3.connect(storage/'archive.db') as db:
        db.execute("UPDATE posts SET sector='SEC_04' WHERE id=?",(item['id'],))
        db.execute('DELETE FROM upload_access');db.execute('DELETE FROM post_uploads')
    with TestClient(create_app(storage,TOKEN)) as restarted:
        assert restarted.get('/api/posts/'+str(item['id'])).status_code==404
        assert restarted.get(url).status_code==404
        restarted.cookies.set(SESSION_COOKIE,raw,path='/api/admin')
        restored=restarted.get('/api/admin/private/posts/'+str(item['id'])).json()
        assert restored['title']==item['title'] and restored['created_at']==item['created_at'] and restored['updated_at']==item['updated_at']
        assert '/api/admin/files/' in restored['content_md']
        assert restarted.get(restored['cover_url']).status_code==200

def test_revoked_session_cannot_read_private_images_or_articles(clients):
    admin,other,_=clients
    url=upload(admin);item=post(admin,cover_url=url)
    assert other.post('/api/admin/login',json={'password':PASSWORD}).status_code==200
    assert admin.put('/api/admin/password',json={'current_password':PASSWORD,'new_password':'another-isolated-password'}).status_code==200
    for path in (url,'/api/admin/private/posts/'+str(item['id'])):
        assert other.get(path).status_code==401 and admin.get(path).status_code==200

def test_unregistered_paths_fail_closed_and_legacy_files_are_registered(clients):
    admin,anonymous,storage=clients
    image=storage/'uploads'/'legacy.png'
    Image.new('RGB',(4,4),'blue').save(image)
    assert anonymous.get('/uploads/legacy.png').status_code==404
    with TestClient(create_app(storage,TOKEN)) as restarted:
        assert restarted.get('/uploads/legacy.png').status_code==200
