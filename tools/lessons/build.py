import json, sys
sys.path.insert(0,'.')
out={}
for m in ['t1','t2','t3','t4']:
    out.update(__import__(m).TOPICS)
order=['android','kotlin','compose','coroutines','flows','architecture','di','networking','storage','buildtools','performance','hr','sysdesign']
assert sorted(out)==sorted(order), set(order)^set(out)
for k,v in out.items():
    for i,l in enumerate(v['lessons']):
        assert l['title'] and l['body'] and len(l['points'])>=3 and l['tip'], (k,i)
json.dump({'v':1,'topics':{k:out[k] for k in order}},open(sys.argv[1] if len(sys.argv)>1 else '../../assets/lessons.json','w'),ensure_ascii=False,separators=(',',':'))
print({k:len(out[k]['lessons']) for k in order}, sum(len(out[k]['articles']) for k in order),'articles')
