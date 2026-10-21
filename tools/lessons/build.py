import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
out = {}
for m in ['t1', 't2', 't3', 't4']:
    out.update(__import__(m).TOPICS)
deep = {}
for m in ['d1', 'd2', 'd3', 'd4']:
    deep.update(__import__(m).DEEP)
order = ['android', 'kotlin', 'compose', 'coroutines', 'flows', 'architecture', 'di', 'networking', 'storage', 'buildtools', 'performance', 'hr', 'sysdesign']
assert sorted(out) == sorted(order), set(order) ^ set(out)
for k in order:
    ls, ds = out[k]['lessons'], deep.get(k, [])
    assert len(ds) == len(ls), (k, len(ls), len(ds))
    for l, d in zip(ls, ds):
        assert d['deep'] and d['mistakes'] and d['qa']['q'] and d['qa']['a'], (k, l['title'])
        l.update(d)
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'lessons.json')
json.dump({'v': 2, 'topics': {k: out[k] for k in order}}, open(dest, 'w'), ensure_ascii=False, separators=(',', ':'))
words = sum(len(json.dumps(out[k]).split()) for k in order)
print('lessons', sum(len(out[k]['lessons']) for k in order), 'deep sections', sum(len(l['deep']) for k in order for l in out[k]['lessons']), '~words', words, '->', dest)
