#!/usr/bin/env python3
"""Machine coding: one source of truth for problems, tests and reference solutions.

  python3 tools/machine_coding/build.py            # generate assets/machine-coding-data.js + /machine-coding/ pages
  KOTLINC=/path/to/kotlinc python3 tools/machine_coding/build.py --verify
                                                   # also compile and run every problem: the reference solution
                                                   # must pass all tests and the empty starter must compile and fail

Sources (this folder):
  problems.json          title, slug, summary, description/hints/approach HTML, starterCode
  kt/p<N>.imports        imports (kept above the editable part, since Kotlin needs them at the top of the file)
  kt/p<N>.sol            reference solution (replaces the editable part)
  kt/p<N>.tests          tests: test("name") { ... } and a main() that ends with summary()
  kt/harness.kt          the tiny test runner shared by all problems
  kt/coshim.kt           local stand-in for kotlinx.coroutines, used only by --verify
In the browser editor the tests sit after //sampleEnd, so Kotlin Playground folds them away but still runs them.
"""
import json, re, os, sys, subprocess, html, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SITE = 'https://droidly.io'
AUTHOR = ('Vivek Choudhary', 'https://www.linkedin.com/in/vivek-choudhary-4686b477')
TODAY = datetime.date.today()

def rd(p): return open(os.path.join(HERE, p), encoding='utf-8').read()
def has(p): return os.path.exists(os.path.join(HERE, p))
def esc(s): return html.escape(str(s), quote=True)

def editable(code):
    code = re.sub(r'^\s*import [^\n]+\n', '', code, flags=re.M)
    i = code.find('\nfun main'); code = code[:i] if i >= 0 else code
    j = code.find('// Simulated flaky network call'); code = code[:j] if j >= 0 else code
    return code.strip() + '\n'

def assemble(pid, body):
    imp = rd(f'kt/p{pid}.imports').strip() if has(f'kt/p{pid}.imports') else ''
    return (imp + '\n\n' if imp else '') + '//sampleStart\n' + body + '//sampleEnd\n\n' + rd('kt/harness.kt') + '\n' + rd(f'kt/p{pid}.tests')

def build():
    P = json.load(open(os.path.join(HERE, 'problems.json'), encoding='utf-8'))
    out = []
    for p in P:
        pid = p['id']; tests = has(f'kt/p{pid}.tests')
        start = editable(p['starterCode']) if tests else p['starterCode']
        out.append({
            'id': pid, 'slug': p['slug'], 'title': p['title'], 'difficulty': p['difficulty'], 'timeMin': p['timeMin'],
            'summary': p['summary'], 'description': p['description'], 'hints': p['hints'], 'approach': p['approach'],
            'androidStudio': bool(p.get('androidStudio')),
            'editorCode': assemble(pid, start) if tests else start,
            'solution': rd(f'kt/p{pid}.sol') if has(f'kt/p{pid}.sol') else None,
            'tests': re.findall(r'\btestS?\("([^"]+)"', rd(f'kt/p{pid}.tests')) if tests else [],
            '_check': assemble(pid, rd(f'kt/p{pid}.sol')) if tests else None,
        })
    return out

def verify(probs):
    kc = os.environ.get('KOTLINC')
    if not kc: sys.exit('Set KOTLINC to the kotlinc binary to verify.')
    tmp = os.path.join(HERE, '.verify'); os.makedirs(tmp, exist_ok=True); ok = True
    for p in probs:
        if not p['_check']: continue
        for kind, code, want_all in (('starter', p['editorCode'], False), ('solution', p['_check'], True)):
            f = os.path.join(tmp, f"p{p['id']}_{kind}.kt"); open(f, 'w').write(code)
            src = [f] + ([os.path.join(HERE, 'kt/coshim.kt')] if 'kotlinx.coroutines' in code else [])
            c = subprocess.run([kc] + src + ['-include-runtime', '-nowarn', '-d', f[:-3] + '.jar'], capture_output=True, text=True)
            if c.returncode: print(f"✗ {p['slug']} {kind}: does not compile\n{c.stderr[-1500:]}"); ok = False; continue
            r = subprocess.run(['java', '-jar', f[:-3] + '.jar'], capture_output=True, text=True, timeout=90)
            last = ([l for l in r.stdout.splitlines() if l.strip()] or ['(no output)'])[-1]
            passed = last.startswith('ALL ') and last.endswith('TESTS PASSED')
            good = passed if want_all else (not passed and 'tests passed' in last)
            print(('✓' if good else '✗'), p['slug'], kind, '→', last); ok &= good
    if not ok: sys.exit('Verification failed.')

CSS = '<link rel="stylesheet" href="/assets/topic-pages.css"/>'
FONTS = '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>'
GA = """<script async src="https://www.googletagmanager.com/gtag/js?id=G-61G11MD574"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-61G11MD574');</script>"""

def head(title, desc, path, ld):
    url = SITE + path
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<link rel="icon" type="image/x-icon" href="/favicon.ico"/>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
<meta name="theme-color" content="#2e6040"/>
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}"/>
<link rel="canonical" href="{url}"/>
<meta property="og:type" content="article"/>
<meta property="og:url" content="{url}"/>
<meta property="og:title" content="{esc(title)}"/>
<meta property="og:description" content="{esc(desc)}"/>
<meta property="og:image" content="{SITE}/assets/og-image.png"/>
<meta property="og:site_name" content="Droidly"/>
<meta name="twitter:card" content="summary_large_image"/>
{FONTS}
{CSS}
{GA}
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<nav class="tp-nav"><a href="/" class="tp-logo"><img src="/assets/logo.png" alt="Droidly" width="32" height="32"/>Droidly</a>
<div class="tp-links"><a href="/questions">Questions</a><a href="/roadmap">Roadmap</a><a href="/practice">Practice</a></div>
<a class="tp-cta" href="/machine_coding">Open the editor</a></nav>
"""

FOOT = """<footer class="tp-foot"><a href="/" class="tp-logo"><img src="/assets/logo.png" alt="" width="24" height="24"/>Droidly</a>
<span>Android interview prep, built by an Android engineer.</span>
<span class="tp-foot-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:support@droidly.io">support@droidly.io</a></span></footer>
<script src="/assets/site-nav.js" defer></script>
</body>
</html>
"""

def crumbs(items):
    return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(items)]}

def byline():
    return (f'<p class="tp-by">By <a href="{AUTHOR[1]}" target="_blank" rel="noopener">{AUTHOR[0]}</a>, Android engineer · '
            f'Updated {TODAY.strftime("%B %Y")}</p>')

def problem_page(p, probs):
    path = f'/machine-coding/{p["slug"]}'
    title = f'{p["title"]} in Kotlin — Android Machine Coding Interview | Droidly'
    if len(title) > 70: title = f'{p["title"]} in Kotlin | Droidly Machine Coding'
    ld = [crumbs([('Droidly', '/'), ('Machine coding', '/machine-coding/'), (p['title'], path)]),
          {'@context': 'https://schema.org', '@type': 'Article', 'headline': f'{p["title"]} in Kotlin', 'description': p['summary'],
           'mainEntityOfPage': SITE + path, 'dateModified': TODAY.isoformat(),
           'author': {'@type': 'Person', 'name': AUTHOR[0], 'url': AUTHOR[1]},
           'publisher': {'@type': 'Organization', 'name': 'Droidly', 'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/logo.png'}}}]
    hints = ''.join(f'<details class="mc-d"><summary>Hint {i + 1}</summary><p>{h}</p></details>' for i, h in enumerate(p['hints']))
    tests = ''.join(f'<li>{esc(t)}</li>' for t in p['tests'])
    sol = (f'<section class="mc-sec"><h2>Reference solution</h2><p class="mc-note">Try it yourself first. Then compare: the solution passes all {len(p["tests"])} tests.</p>'
           f'<details class="mc-d mc-sol"><summary>Show the Kotlin solution</summary><pre class="code-block mc-code">{esc(p["solution"])}</pre></details></section>') if p['solution'] else ''
    others = ''.join(f'<a href="/machine-coding/{o["slug"]}">{esc(o["title"])}</a>' for o in probs if o['id'] != p['id'])
    cta_label = 'Open it in the editor' if not p['androidStudio'] else 'Open the challenge'
    body = f"""<main class="tp-wrap" id="top">
<nav class="tp-crumb" aria-label="Breadcrumb"><a href="/">Droidly</a><span>›</span><a href="/machine-coding/">Machine coding</a><span>›</span><span>{esc(p['title'])}</span></nav>
<header class="tp-head"><h1>{esc(p['title'])} in Kotlin</h1><p class="tp-intro">{esc(p['summary'].split('. Android')[0].split('. A UI')[0])}. A common Android machine coding round question{', solved in the browser and checked by tests' if p['tests'] else ''}.</p>
{byline()}
<div class="tp-stats"><span class="tp-d {p['difficulty'].lower()}">{esc(p['difficulty'])}</span><span>About {p['timeMin']} min</span>{f"<span><b>{len(p['tests'])}</b> automatic tests</span>" if p['tests'] else '<span>Build it in Android Studio</span>'}</div>
<div class="tp-learn"><a class="mc-go" href="/machine_coding#{p['slug']}">{cta_label}</a></div></header>
<section class="mc-sec mc-prob">{p['description']}</section>
{f'<section class="mc-sec"><h2>What the tests check</h2><ul class="mc-tests">{tests}</ul></section>' if tests else ''}
<section class="mc-sec"><h2>Hints</h2>{hints}</section>
<section class="mc-sec mc-prob"><h2>Approach</h2>{p['approach']}</section>
{sol}
<aside class="tp-box"><div><b>Practise it under interview conditions.</b><span>Timer, editor and tests in your browser. Your solved problems are saved to your free account.</span></div><a href="/machine_coding#{p['slug']}">Open the editor</a></aside>
<section class="tp-more"><h2>More machine coding problems</h2><div class="tp-grid">{others}</div>
<p><a class="tp-all" href="/questions">Android interview questions with answers</a></p></section>
</main>
"""
    return path, head(title, p['summary'], path, ld) + body + FOOT

def hub_page(probs):
    path = '/machine-coding/'
    title = 'Android Machine Coding Interview Questions in Kotlin | Droidly'
    desc = f'{len(probs)} Android machine coding round problems in Kotlin: LRU cache, rate limiter, event bus, retry with backoff and more, with tests and solutions.'
    ld = [crumbs([('Droidly', '/'), ('Machine coding', path)])]
    cards = ''.join(f'<a class="tp-sd" href="/machine-coding/{p["slug"]}"><b>{esc(p["title"])}</b><span>{esc(p["summary"].split(". Android")[0].split(". A UI")[0])}.</span>'
                    f'<em class="tp-d {p["difficulty"].lower()}">{esc(p["difficulty"])} · {p["timeMin"]} min</em></a>' for p in probs)
    steps = [('Restate the problem and agree on the API', 'Write the class and function signatures first, and confirm edge cases: empty input, capacity 1, invalid arguments.'),
             ('Pick the data structures out loud', 'Say why: a HashMap for O(1) lookup, a linked list for order, a sealed class for states. Interviewers grade the reasoning.'),
             ('Get a correct version working', 'Clean, readable Kotlin beats a clever half-finished solution. Run it against small examples as you go.'),
             ('Handle the edge cases and threading', 'Most Android machine coding rounds ask what happens with concurrent calls, lifecycle changes or failures.'),
             ('Talk about trade-offs and tests', 'Explain complexity, what you would change for production, and how you would unit test it.')]
    st = ''.join(f'<li><b>{esc(a)}</b><span>{esc(b)}</span></li>' for a, b in steps)
    body = f"""<main class="tp-wrap" id="top">
<nav class="tp-crumb" aria-label="Breadcrumb"><a href="/">Droidly</a><span>›</span><span>Machine coding</span></nav>
<header class="tp-head"><h1>Android Machine Coding Interview Questions</h1><p class="tp-intro">The machine coding round asks you to build a small, working piece of an app in 30–60 minutes: a cache, a rate limiter, a state machine or a screen. These problems are written in Kotlin and come with hints, an approach, automatic tests and a reference solution. Solve them in the browser editor with a timer, like the real round.</p>
{byline()}
<div class="tp-learn"><a class="mc-go" href="/machine_coding">Open the editor</a></div></header>
<section class="tp-steps"><h2>How to approach a machine coding round</h2><ol>{st}</ol></section>
<section><h2 class="tp-h2">{len(probs)} problems</h2><div class="tp-sds">{cards}</div></section>
<section class="tp-more"><h2>Keep preparing</h2><div class="tp-grid"><a href="/android-system-design-interview-questions">Android System Design Interview Questions</a><a href="/kotlin-interview-questions">Kotlin Interview Questions</a><a href="/kotlin-coroutines-interview-questions">Kotlin Coroutines Interview Questions</a><a href="/android-interview-questions-for-experienced">Android Interview Questions for Experienced</a></div></section>
</main>
"""
    return path, head(title, desc, path, ld) + body + FOOT

if __name__ == '__main__':
    probs = build()
    if '--verify' in sys.argv: verify(probs)
    data = [{k: v for k, v in p.items() if not k.startswith('_')} for p in probs]
    open(os.path.join(ROOT, 'assets/machine-coding-data.js'), 'w', encoding='utf-8').write(
        '/* Generated by tools/machine_coding/build.py — edit the sources there, not this file. */\nwindow.MC_PROBLEMS = ' + json.dumps(data, ensure_ascii=False) + ';\n')
    os.makedirs(os.path.join(ROOT, 'machine-coding'), exist_ok=True)
    for p in probs:
        path, out = problem_page(p, probs)
        open(os.path.join(ROOT, 'machine-coding', p['slug'] + '.html'), 'w', encoding='utf-8').write(out)
    path, out = hub_page(probs)
    open(os.path.join(ROOT, 'machine-coding', 'index.html'), 'w', encoding='utf-8').write(out)
    print(f'{len(probs)} problems → assets/machine-coding-data.js and machine-coding/*.html')
