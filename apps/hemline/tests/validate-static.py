from pathlib import Path
from bs4 import BeautifulSoup
import json,re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
js=(root/'app.js').read_text()
soup=BeautifulSoup(html,'html.parser')
ids={tag.get('id') for tag in soup.find_all(id=True)}
refs=set(re.findall(r"\$\('#([^']+)'\)",js))|set(re.findall(r"querySelector\('#([^']+)'\)",js))
missing=sorted(refs-ids)
assert not missing, f'missing DOM ids: {missing}'
listeners=set(re.findall(r"\$\('#([^']+)'\)\.addEventListener",js))
for button in soup.find_all('button'):
    if button.has_attr('data-workshop-trigger') or button.has_attr('data-close-dialog'): continue
    bid=button.get('id')
    assert bid, f'button without id/semantic handler: {button}'
    assert bid in listeners, f'button without listener: {bid}'
for link in soup.find_all('a'):
    assert link.get('href'), f'link without href: {link}'
config=json.loads((root/'app.config.json').read_text())
manifest=json.loads((root/'manifest.webmanifest').read_text())
assert config['slug']=='hemline'
assert config['runtime']=='quick'
assert config['version']=='1.0.0'
assert config['cacheName']=='hemline-v1.0.0-p2'
assert manifest['id']=='/apps/hemline/'
assert manifest['start_url']=='./' and manifest['scope']=='./'
assert config['storageNamespace']=='pocket-works:hemline'
sw=(root/'sw.js').read_text()
for owned in ['index.html','app.config.json','styles.css','app.js','engine.js','bot.js','manifest.webmanifest','icons/icon.svg']:
    assert (root/owned).is_file(), owned
    assert f"./{owned}" in sw, f'{owned} missing from service worker shell'
print(f'static contract: ok ({len(ids)} ids, {len(soup.find_all("button"))} buttons)')
