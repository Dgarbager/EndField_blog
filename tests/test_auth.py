import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app, SESSION_COOKIE, SESSION_SECONDS

BOOTSTRAP='test-only-bootstrap'
PASSWORD='remember-this-2026'
NEW_PASSWORD='replacement-2026'

@pytest.fixture
def app(tmp_path,monkeypatch):
    monkeypatch.delenv('BLOG_ADMIN_PASS',raising=False)
    return create_app(tmp_path,BOOTSTRAP)

def setup(client,password=PASSWORD):
    response=client.post('/api/admin/setup',json={'setup_token':BOOTSTRAP,'new_password':password})
    assert response.status_code==200,response.text
    return response

def test_setup_requires_bootstrap_and_stores_only_hashes(app,tmp_path):
    with TestClient(app) as client:
        assert client.get('/api/admin/auth/status').json()=={'password_configured':False,'setup_available':True}
        assert client.get('/api/admin/session').status_code==401
        assert client.post('/api/admin/setup',json={'setup_token':'wrong','new_password':PASSWORD}).status_code==401
        assert client.post('/api/admin/setup',json={'setup_token':BOOTSTRAP,'new_password':'short'}).status_code==422
        post=client.post('/api/admin/posts',headers={'Authorization':'Bearer '+BOOTSTRAP},json={'title':'已有文章','sector':'SEC_01','content_md':'保留现有数据'}).json()
        response=setup(client)
        assert 'token' not in response.json()
        assert client.get('/api/admin/session').status_code==200
        assert client.get('/api/posts/'+str(post['id'])).json()['title']=='已有文章'
        with sqlite3.connect(tmp_path/'archive.db') as db:
            encoded=db.execute('SELECT password_hash FROM admin_settings').fetchone()[0]
            stored=db.execute('SELECT token_hash FROM admin_sessions').fetchone()[0]
        assert encoded.startswith('pbkdf2_sha256$600000$') and PASSWORD not in encoded
        assert stored!=client.cookies.get(SESSION_COOKIE) and len(stored)==64
        assert client.post('/api/admin/setup',json={'setup_token':BOOTSTRAP,'new_password':NEW_PASSWORD}).status_code==409
        client.cookies.clear()
        assert client.get('/api/admin/auth',headers={'Authorization':'Bearer '+BOOTSTRAP}).status_code==401

def test_secure_cookie_login_and_logout_revocation(app):
    with TestClient(app,base_url='https://testserver') as client:
        response=setup(client);cookie=response.headers['set-cookie'].lower()
        assert all(flag in cookie for flag in ['httponly','secure','samesite=strict',f'max-age={SESSION_SECONDS}','path=/api/admin'])
        old=client.cookies.get(SESSION_COOKIE)
        assert client.post('/api/admin/logout').status_code==200
        assert client.get('/api/admin/session').status_code==401
        client.cookies.set(SESSION_COOKIE,old,path='/api/admin')
        assert client.get('/api/admin/session').status_code==401
        client.cookies.clear()
        assert client.post('/api/admin/login',json={'password':'wrong'}).status_code==401
        assert client.post('/api/admin/login',json={'password':PASSWORD}).status_code==200
        assert client.get('/api/admin/auth').status_code==200

def test_change_password_revokes_other_devices(app):
    with TestClient(app) as first, TestClient(app) as other:
        setup(first)
        assert other.post('/api/admin/login',json={'password':PASSWORD}).status_code==200
        assert first.put('/api/admin/password',json={'current_password':'wrong','new_password':NEW_PASSWORD}).status_code==400
        assert first.put('/api/admin/password',json={'current_password':PASSWORD,'new_password':PASSWORD}).status_code==422
        changed=first.put('/api/admin/password',json={'current_password':PASSWORD,'new_password':NEW_PASSWORD})
        assert changed.status_code==200 and changed.json()['password_changed']
        assert first.get('/api/admin/session').status_code==200
        assert other.get('/api/admin/session').status_code==401
        assert other.post('/api/admin/login',json={'password':PASSWORD}).status_code==401
        assert other.post('/api/admin/login',json={'password':NEW_PASSWORD}).status_code==200

def test_expired_or_forged_sessions_fail(app,tmp_path):
    with TestClient(app) as client:
        setup(client)
        with sqlite3.connect(tmp_path/'archive.db') as db:db.execute('UPDATE admin_sessions SET expires_at=0')
        assert client.get('/api/admin/session').status_code==401
        assert client.put('/api/admin/password',json={'current_password':PASSWORD,'new_password':NEW_PASSWORD}).status_code==401
        client.cookies.clear();client.cookies.set(SESSION_COOKIE,'forged',path='/api/admin')
        assert client.get('/api/admin/auth').status_code==401

def test_login_throttling(app):
    with TestClient(app) as client:
        setup(client);client.post('/api/admin/logout')
        for _ in range(8):assert client.post('/api/admin/login',json={'password':'wrong'}).status_code==401
        response=client.post('/api/admin/login',json={'password':PASSWORD})
        assert response.status_code==429 and response.headers['retry-after']=='300'

def test_password_session_persist_and_env_never_overwrites_change(tmp_path,monkeypatch):
    monkeypatch.setenv('BLOG_ADMIN_PASS',PASSWORD)
    with TestClient(create_app(tmp_path,BOOTSTRAP)) as first:
        assert first.post('/api/admin/login',json={'password':PASSWORD}).status_code==200
        assert first.put('/api/admin/password',json={'current_password':PASSWORD,'new_password':NEW_PASSWORD}).status_code==200
        raw=first.cookies.get(SESSION_COOKIE)
    with TestClient(create_app(tmp_path,BOOTSTRAP)) as second:
        second.cookies.set(SESSION_COOKIE,raw,path='/api/admin')
        assert second.get('/api/admin/session').status_code==200
        assert second.post('/api/admin/login',json={'password':PASSWORD}).status_code==401
        assert second.post('/api/admin/login',json={'password':NEW_PASSWORD}).status_code==200

def test_no_open_setup_when_bootstrap_missing(tmp_path,monkeypatch):
    monkeypatch.delenv('BLOG_ADMIN_PASS',raising=False)
    with TestClient(create_app(tmp_path,'')) as client:
        assert client.get('/api/admin/auth/status').json()['setup_available'] is False
        assert client.post('/api/admin/setup',json={'setup_token':'x','new_password':PASSWORD}).status_code==503

def test_cross_origin_management_rejected(app):
    with TestClient(app) as client:
        setup(client)
        assert client.post('/api/admin/logout',headers={'Origin':'https://evil.example'}).status_code==403
        assert client.get('/api/admin/session').status_code==200
        assert client.post('/api/admin/logout',headers={'Origin':'http://testserver'}).status_code==200
