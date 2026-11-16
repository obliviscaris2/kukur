#!/usr/bin/env python3
"""List CC0 sounds on Freesound for a query (helper for choosing entries in sounds.json).
   python3 pipeline/audio/freesound_search.py "dog bark" [max_seconds]"""
import re, sys, urllib.parse, urllib.request, html

def search(q, max_dur=60.0, n=12):
    url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': 'license:"Creative Commons 0"', 's': 'Rating (highest first)'})
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (KukurGameDev sound picker)'})
    page = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    out = []
    for block in page.split('data-sound-id="')[1:]:
        sid = block.split('"', 1)[0]
        mp3 = re.search(r'data-mp3="([^"]+)"', block); dur = re.search(r'data-duration="([^"]+)"', block)
        title = re.search(r'href="/people/([^/]+)/sounds/' + sid + r'/" title="([^"]*)"', block)
        if not (mp3 and dur): continue
        d = float(dur.group(1))
        if d > max_dur: continue
        out.append({'id': int(sid), 'title': html.unescape(title.group(2)) if title else '', 'author': title.group(1) if title else '', 'dur': round(d, 2), 'url': mp3.group(1).replace('-lq.mp3', '-hq.mp3')})
        if len(out) >= n: break
    return out

if __name__ == '__main__':
    for r in search(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 60):
        print(f"{r['id']:>7}  {r['dur']:>6}s  {r['author'][:16]:16}  {r['title'][:60]}")
