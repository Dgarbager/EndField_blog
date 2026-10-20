from pathlib import Path
import json, urllib.request, tarfile, io
root=Path(r'C:\Users\33074\Desktop\Blog\.construction\frontend\assets\vendor');root.mkdir(parents=True,exist_ok=True)
packages={
 'marked':{'lib/marked.umd.js':'marked.js'},
 'dompurify':{'dist/purify.min.js':'purify.js'},
 '@highlightjs/cdn-assets':{'highlight.min.js':'highlight.js','languages/matlab.min.js':'matlab.js','styles/github-dark.min.css':'highlight-dark.css','styles/github.min.css':'highlight-day.css'},
 'katex':{'dist/katex.min.js':'katex.js','dist/contrib/auto-render.min.js':'katex-auto.js','dist/katex.min.css':'katex.css'}
}
manifest=[]
for package,mapping in packages.items():
 meta=json.load(urllib.request.urlopen('https://registry.npmjs.org/'+package.replace('/','%2F')+'/latest',timeout=30))
 archive=urllib.request.urlopen(meta['dist']['tarball'],timeout=60).read()
 with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
  names={m.name:m for m in tar.getmembers() if m.isfile()}
  for name,target in mapping.items():
   member=names.get('package/'+name)
   if member is None:raise RuntimeError(f'Missing package asset: {package}:{name}')
   (root/target).write_bytes(tar.extractfile(member).read())
  for path,member in names.items():
   relative=path.removeprefix('package/')
   if package=='katex' and relative.startswith('dist/fonts/'):
    output=root/'fonts'/Path(relative).name;output.parent.mkdir(exist_ok=True);output.write_bytes(tar.extractfile(member).read())
   if relative.upper() in ['LICENSE','LICENSE.MD','LICENSE.TXT']:
    (root/(package.replace('/','-').replace('@','')+'-LICENSE.txt')).write_bytes(tar.extractfile(member).read())
 manifest.append({'name':package,'version':meta['version'],'source':meta['dist']['tarball'],'integrity':meta['dist'].get('integrity')})
 print(package,meta['version'])
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
