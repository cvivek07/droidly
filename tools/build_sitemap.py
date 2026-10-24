#!/usr/bin/env python3
"""Rebuild sitemap.xml. Run from the repo root after adding or changing pages:  python3 tools/build_sitemap.py
lastmod = the page's last commit date (today if it has uncommitted changes). Pages that are private,
hidden or only embedded elsewhere (profile, premium, explainers) are left out on purpose."""
import glob, os, subprocess, datetime

SITE = 'https://droidly.io'
EXCLUDE = {'profile', 'premium', 'explainer_coroutines', 'explainer_flow', 'explainer_recomposition'}
FIRST = ['index', 'questions']   # most important first; the rest follow alphabetically by group

def lastmod(path):
    today = datetime.date.today().isoformat()
    try:
        dirty = subprocess.run(['git', 'status', '--porcelain', '--', path], capture_output=True, text=True).stdout.strip()
        if dirty: return today
        d = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', path], capture_output=True, text=True).stdout.strip()
        return d or today
    except Exception:
        return today

def group(n):
    if n in FIRST: return (0, FIRST.index(n))
    if n.endswith('-interview-questions'): return (1, n)
    if n in ('roadmap', 'practice'): return (2, n)
    if n.startswith('concept_'): return (3, n)
    if n.startswith('sysdesign_'): return (4, n)
    if n in ('privacy', 'terms', 'refund'): return (6, n)
    return (5, n)

pages = sorted((os.path.basename(f)[:-5] for f in glob.glob('*.html')), key=group)
rows = []
for n in pages:
    if n in EXCLUDE: continue
    loc = SITE + '/' if n == 'index' else SITE + '/' + n
    rows.append(f'  <url>\n    <loc>{loc}</loc>\n    <lastmod>{lastmod(n + ".html")}</lastmod>\n  </url>')
open('sitemap.xml', 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + '\n'.join(rows) + '\n</urlset>\n')
print(len(rows), 'URLs written to sitemap.xml')
