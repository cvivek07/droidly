#!/usr/bin/env python3
"""Build assets/roadmap-index.json from questions.html.
Usage: python3 tools/build_roadmap_index.py questions.html assets/roadmap-index.json
Re-run whenever questions are added/reordered/re-tagged. Question ids are "<topic>:<Qn>",
so APPEND new questions at the end of a topic; reordering would orphan users' saved marks."""
import re, sys, json, html

src, out = sys.argv[1], sys.argv[2]
t = open(src, encoding='utf-8', errors='ignore').read()
starts = [(m.group(1), m.start()) for m in re.finditer(r'<div class="topic-section[^"]*" id="topic-(\w+)"', t)]
if not starts:
    starts = [(m.group(1), m.start()) for m in re.finditer(r'id="topic-(\w+)"', t)]
names = {}
for m in re.finditer(r"(\w+):\s*\{\s*name:\s*'([^']+)'", t):
    names[m.group(1)] = m.group(2)
topics = {}
for idx, (tid, pos) in enumerate(starts):
    end = starts[idx + 1][1] if idx + 1 < len(starts) else len(t)
    sec = t[pos:end]
    items = []
    if tid == 'sysdesign':
        for m in re.finditer(r'<a class="sd-card" href="/?([\w\-]+)(?:\.html)?">(.*?)</a>', sec, re.S):
            body = m.group(2)
            title = re.search(r'sd-card-title">([^<]+)', body)
            diff = re.search(r'sd-diff-(\w+)', body)
            items.append({'id': 'sysdesign:' + m.group(1).replace('sysdesign_', ''),
                          'href': '/' + m.group(1), 'q': html.unescape(title.group(1).strip()) if title else m.group(1),
                          'd': (diff.group(1) if diff else 'hard')})
    else:
        for m in re.finditer(r'<div class="q-card"[^>]*>(.*?)<div class="q-answer">', sec, re.S):
            body = m.group(1)
            num = re.search(r'q-number">Q(\d+)', body)
            diff = re.search(r'q-diff diff-(\w+)', body)
            text = re.search(r'class="q-text">(.*?)</div>', body, re.S)
            if not (num and text):
                continue
            q = re.sub(r'<[^>]+>', '', text.group(1))
            items.append({'id': '%s:%s' % (tid, num.group(1)), 'n': int(num.group(1)),
                          'q': html.unescape(' '.join(q.split())), 'd': diff.group(1) if diff else 'medium',
                          'm': 1 if 'Most Asked' in body else 0})
    topics[tid] = {'name': re.sub(r'^[^\w&]+', '', names.get(tid, tid)).strip(), 'items': items}
json.dump({'v': 1, 'topics': topics}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for k, v in topics.items():
    print(k, len(v['items']), sum(1 for i in v['items'] if i.get('m')))
