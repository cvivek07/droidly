#!/usr/bin/env python3
"""Build assets/answers/<topic>.json from questions.html, for Daily practice (shows one answer at a time
without downloading the 3.6 MB question bank).
Usage: python3 tools/build_answers.py questions.html assets/answers
Re-run whenever answers change. Ids match assets/roadmap-index.json ("<topic>:<Qn>")."""
import re, sys, json, os

src, out = sys.argv[1], sys.argv[2]
t = open(src, encoding='utf-8', errors='ignore').read()
starts = [(m.group(1), m.start()) for m in re.finditer(r'<div class="topic-section[^"]*" id="topic-(\w+)"', t)]
os.makedirs(out, exist_ok=True)

def inner(sec, pos):
    """Return the HTML inside <div class="q-answer-inner"> ... its matching </div>."""
    open_tag = sec.index('<div class="q-answer-inner">', pos)
    i = open_tag + len('<div class="q-answer-inner">'); depth = 1
    for m in re.compile(r'<div\b|</div>').finditer(sec, i):
        depth += 1 if m.group(0) == '<div' else -1
        if depth == 0:
            return sec[i:m.start()]
    raise ValueError('unbalanced answer')

total = 0
for idx, (tid, pos) in enumerate(starts):
    if tid == 'sysdesign':
        continue                      # system design lives on its own walkthrough pages
    end = starts[idx + 1][1] if idx + 1 < len(starts) else len(t)
    sec = t[pos:end]
    answers = {}
    for m in re.finditer(r'<div class="q-card"[^>]*>(.*?)<div class="q-answer">', sec, re.S):
        num = re.search(r'q-number">Q(\d+)', m.group(1))
        if not num:
            continue
        h = inner(sec, m.end())
        h = re.sub(r'\s*<div class="answer-label">Answer</div>\s*', '', h, count=1)
        h = re.sub(r'<script\b.*?</script>', '', h, flags=re.S | re.I)          # answers are static content only
        h = re.sub(r'\son\w+="[^"]*"', '', h)                                     # no inline handlers
        answers['%s:%s' % (tid, num.group(1))] = h.strip()
    json.dump({'v': 1, 'topic': tid, 'answers': answers}, open(os.path.join(out, tid + '.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    total += len(answers)
    print(tid, len(answers), os.path.getsize(os.path.join(out, tid + '.json')) // 1024, 'KB')
print('total', total)
