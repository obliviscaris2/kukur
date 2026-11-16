#!/usr/bin/env python3
"""Download the game's sound bank (CC0, freesound.org previews) listed in pipeline/audio/sounds.json.

    python3 pipeline/audio/fetch_sounds.py          (or: npm run assets:audio)

Writes assets/audio/<freesound-id>.mp3, assets/audio/manifest.json (what the game loads) and
assets/audio/CREDITS.md. To change a sound: find a CC0 one with pipeline/audio/freesound_search.py "query",
put its id in sounds.json and re-run.
"""
import json, os, re, sys, time, urllib.request, html

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'audio')
UA = {'User-Agent': 'Mozilla/5.0 (KukurGameDev sound fetcher)'}

def info(sid):
    page = urllib.request.urlopen(urllib.request.Request(f'https://freesound.org/s/{sid}/', headers=UA), timeout=30).read().decode('utf-8', 'replace')
    mp3 = re.search(r'https://cdn\.freesound\.org/previews/[^"]+-lq\.mp3', page)
    title = re.search(r'<title>(.*?)</title>', page, re.S)
    lic = 'CC0' if 'publicdomain/zero' in page else ('CC-BY' if 'creativecommons.org/licenses/by/' in page else '?')
    author = re.search(r'freesound\.org/people/([^/"]+)/', page)
    return {'url': mp3.group(0).replace('-lq.mp3', '-hq.mp3') if mp3 else None, 'title': html.unescape(title.group(1).strip()) if title else str(sid), 'license': lic, 'author': author.group(1) if author else '?'}

def main():
    bank = json.load(open(os.path.join(os.path.dirname(__file__), 'sounds.json')))
    os.makedirs(OUT, exist_ok=True)
    manifest, credits = {}, ['# Sound credits', '', 'All sounds from [freesound.org](https://freesound.org) (previews). Thank you!', '']
    for key, spec in bank.items():
        if key.startswith('_'): continue
        files = []
        for sid in spec['ids']:
            path = os.path.join(OUT, f'{sid}.mp3')
            meta_path = path + '.json'
            if os.path.exists(path) and os.path.exists(meta_path) and '--force' not in sys.argv:
                meta = json.load(open(meta_path))
            else:
                meta = info(sid)
                if not meta['url']: print('!! no preview for', sid); continue
                if meta['license'] not in ('CC0', 'CC-BY'): print('!! skipping non-free', sid, meta['license']); continue
                urllib.request.urlretrieve(urllib.request.Request(meta['url'], headers=UA).full_url, path)
                json.dump(meta, open(meta_path, 'w')); time.sleep(0.5)
            files.append(f'{sid}.mp3')
            credits.append(f"- `{key}`: \"{meta['title']}\" by {meta['author']} ({meta['license']}) — https://freesound.org/s/{sid}/")
            print(f'{key:14} {sid:>7} {meta["license"]:6} {os.path.getsize(path) // 1024:>5} KB  {meta["title"][:50]}')
        manifest[key] = {**{k: v for k, v in spec.items() if k != 'ids'}, 'files': files}
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    open(os.path.join(OUT, 'CREDITS.md'), 'w').write('\n'.join(credits) + '\n')

if __name__ == '__main__':
    main()
