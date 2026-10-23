"""Public BGM files are a fixed allowlist, independent of private image uploads."""
from fastapi.testclient import TestClient
from backend.main import create_app


def test_missing_music_catalog_and_filename_allowlist(tmp_path):
    with TestClient(create_app(tmp_path, 'isolated-music-test')) as client:
        response = client.get('/api/music')
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
        assert set(response.json()['tracks']) == {'night', 'day', 'wuling'}
        assert not any(track['available'] for track in response.json()['tracks'].values())
        for path in ('night', 'day', 'wuling', 'archive.db', 'SEC_04', '%2e%2e%2farchive.db'):
            assert client.get('/api/music/' + path).status_code == 404
        assert client.get('/storage/archive.db').status_code == 404


def test_public_music_supports_head_and_byte_ranges(tmp_path):
    with TestClient(create_app(tmp_path, 'isolated-music-test')) as client:
        path = tmp_path / 'uploads' / 'audio' / 'bgm-night.mp3'
        contents = b'ID3' + bytes(range(256)) * 8
        path.write_bytes(contents)
        tracks = client.get('/api/music').json()['tracks']
        assert tracks['night']['available'] is True
        assert tracks['day']['available'] is False
        url = tracks['night']['url']
        response = client.get(url, headers={'Range': 'bytes=50-99'})
        assert response.status_code == 206
        assert response.content == contents[50:100]
        assert response.headers['content-range'] == f'bytes 50-99/{len(contents)}'
        assert response.headers['content-type'] == 'audio/mpeg'
        assert response.headers['accept-ranges'] == 'bytes'
        assert client.head(url).content == b''
        assert client.get(url, headers={'Range': 'bytes=9000-9999'}).status_code == 416
        # The existing upload route remains image-only, including this directory.
        assert client.get('/uploads/audio/bgm-night.mp3').status_code == 404
        old_url = url
        path.write_bytes(contents + b'updated')
        assert client.get('/api/music').json()['tracks']['night']['url'] != old_url


def test_empty_audio_and_unlisted_files_are_not_exposed(tmp_path):
    with TestClient(create_app(tmp_path, 'isolated-music-test')) as client:
        directory = tmp_path / 'uploads' / 'audio'
        (directory / 'bgm-night.mp3').write_bytes(b'')
        (directory / 'private.mp3').write_bytes(b'private audio')
        assert client.get('/api/music').json()['tracks']['night']['available'] is False
        assert client.get('/api/music/night').status_code == 404
        assert client.get('/api/music/private.mp3').status_code == 404
