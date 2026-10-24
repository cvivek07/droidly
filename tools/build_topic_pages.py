#!/usr/bin/env python3
"""Build the SEO topic pages (e.g. /kotlin-coroutines-interview-questions) from the question bank.
Usage: python3 tools/build_topic_pages.py            (run from the repo root)
Reads questions.html (questions, difficulty, "Most asked") and writes one static page per topic plus the
Android system design hub. Re-run after editing questions.html, then commit the generated pages."""
import re, html, json, datetime, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://droidly.io'
AUTHOR = ('Vivek Choudhary', 'https://www.linkedin.com/in/vivek-choudhary-4686b477')
TODAY = datetime.date.today()

# id -> slug, H1, intro, short "covers" list for the description, related concept page
TOPICS = {
 'android': ('android-fundamentals-interview-questions', 'Android Fundamentals Interview Questions',
   'Questions on how Android itself works: the Activity and Fragment lifecycle, Intents and deep links, Services and background work, Context, permissions, storage, security and accessibility. Interviewers use these to check that you understand the platform, not just the libraries on top of it.',
   'Activity lifecycle, Fragments, Intents, Services, Context and permissions', 'concept_android_fundamentals'),
 'kotlin': ('kotlin-interview-questions', 'Kotlin Interview Questions',
   'Kotlin language questions asked in Android interviews: null safety, scope functions, data and sealed classes, generics and variance, collections, exceptions, Java interop and newer features from Kotlin 2.0 onwards. Expect to explain why a feature exists, not just its syntax.',
   'null safety, scope functions, sealed classes, generics and Java interop', 'concept_kotlin'),
 'compose': ('jetpack-compose-interview-questions', 'Jetpack Compose Interview Questions',
   'Jetpack Compose questions from basics to production: recomposition, state and state hoisting, side effects, collecting StateFlow, navigation, animations, View interop, stability and lazy lists, plus real UI scenarios you may be asked to build.',
   'recomposition, state hoisting, side effects, navigation and stability', 'concept_compose'),
 'coroutines': ('kotlin-coroutines-interview-questions', 'Kotlin Coroutines Interview Questions',
   'Coroutine questions that come up in almost every Android interview: suspend functions, scopes and structured concurrency, dispatchers, cancellation, exception handling, Channels, StateFlow and SharedFlow, testing, and real scenarios such as parallel API calls and polling.',
   'structured concurrency, dispatchers, cancellation, exceptions and testing', 'concept_coroutines'),
 'flows': ('kotlin-flow-interview-questions', 'Kotlin Flow Interview Questions',
   'In-depth Kotlin Flow questions: cold and hot flows, operators, backpressure, StateFlow and SharedFlow, lifecycle-aware collection, testing with Turbine, and code-review style scenarios such as search-as-you-type, polling and memory leaks.',
   'cold vs hot flows, operators, backpressure, StateFlow and Turbine', 'concept_coroutines'),
 'architecture': ('android-architecture-interview-questions', 'Android Architecture Interview Questions',
   'Architecture questions for mid-level and senior Android roles: MVVM, MVI and MVP, Clean Architecture layers and use cases, repositories, multi-module projects and navigation, testing strategy, and how data flows from the network to the UI.',
   'MVVM, MVI, Clean Architecture, modularisation and testing', 'concept_mvvm'),
 'di': ('hilt-dagger-interview-questions', 'Hilt and Dagger Interview Questions',
   'Dependency injection questions with a focus on Hilt and Dagger: why DI matters, components and scopes, modules and qualifiers, assisted injection, testing with Hilt, multi-module setups and fixing common build errors.',
   'Hilt, Dagger, scopes, qualifiers and testing', 'concept_di'),
 'networking': ('android-networking-interview-questions', 'Android Networking Interview Questions',
   'Android networking questions: how Retrofit and OkHttp work, interceptors, authentication and token refresh, caching, error handling, pagination, file uploads, REST vs GraphQL, HTTPS, and designing a production networking layer.',
   'Retrofit, OkHttp, interceptors, token refresh and caching', 'concept_networking'),
 'storage': ('android-room-datastore-interview-questions', 'Android Room and DataStore Interview Questions',
   'Data storage questions: Room vs SQLite, DAOs, migrations and TypeConverters, DataStore vs SharedPreferences, file storage locations, caching strategies and offline-first data layers.',
   'Room, migrations, DataStore, caching and offline-first', 'concept_room'),
 'buildtools': ('gradle-android-build-interview-questions', 'Gradle and Android Build Interview Questions',
   'Build system questions: how Gradle builds an Android app, build types and flavours, version catalogs, compileSdk, minSdk and targetSdk, R8 and ProGuard, the configuration cache, baseline profiles and faster builds.',
   'Gradle, build variants, version catalogs, R8 and baseline profiles', None),
 'performance': ('android-performance-interview-questions', 'Android Performance Interview Questions',
   'Performance questions for senior roles: memory leaks, startup time, jank and frame drops, Compose performance, garbage collection, and profiling with Perfetto and Android Studio. Most are scenarios: something is slow, how do you find out why and fix it?',
   'memory leaks, startup time, jank and profiling', None),
 'hr': ('android-developer-behavioral-interview-questions', 'Behavioral Interview Questions for Android Developers',
   'Behavioral questions Android developers are asked: introducing yourself, leading projects, handling conflict, decisions with incomplete information, deadlines, feedback and failure, motivation and salary expectations. Each answer shows how to structure a strong, specific story.',
   'tell me about yourself, leadership, conflict and salary', None),
}
ORDER = ['kotlin', 'coroutines', 'flows', 'compose', 'android', 'architecture', 'di', 'networking', 'storage', 'performance', 'buildtools', 'hr']
SD_SLUG = 'android-system-design-interview-questions'
SD_DESC = {
 'analyticsdk': 'Event capture, buffering, offline persistence, batching and consent.',
 'chat_hi_style': 'WhatsApp-style chat: offline-first, WebSocket lifecycle, delivery receipts, media.',
 'ecommerce': 'Flipkart or Amazon style listing: server-driven UI, Paging 3 with filters, optimistic cart.',
 'filedownload': 'Resumable chunked downloads, WorkManager, Scoped Storage and progress.',
 'imageloader': 'Build Coil or Glide: memory and disk caches, LRU, bitmap pooling, request dedup.',
 'instafeed': 'Infinite feed: Paging 3, offline-first caching, video autoplay, optimistic UI.',
 'mapslocation': 'Live location like Ola or Uber: location updates, WebSocket streaming, smooth markers.',
 'networkingsdk': 'Build a Retrofit-like client: annotations, interceptor chain, converters, auth refresh.',
 'offlinenews': 'Room as the single source of truth, WorkManager sync, freshness vs data and battery.',
 'payment': 'Checkout SDK, card tokenisation, UPI intents, idempotency and double-charge prevention.',
 'pushnotif': 'FCM tokens, notification vs data messages, channels, rich notifications, deep links.',
 'ridesharing': 'Booking flow, trip state machine, live driver tracking and payment.',
 'videostreaming': 'Adaptive bitrate, DASH/HLS, player lifecycle, PiP and offline downloads.',
}

def esc(s): return html.escape(str(s), quote=True)

def load():
    t = open(os.path.join(ROOT, 'questions.html'), encoding='utf-8').read()
    starts = [(m.group(1), m.start()) for m in re.finditer(r'<div class="topic-section[^"]*" id="topic-(\w+)"', t)]
    idx = json.load(open(os.path.join(ROOT, 'assets/roadmap-index.json'), encoding='utf-8'))
    data = {}
    for i, (tid, pos) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(t)
        sec = t[pos:end]
        if tid == 'sysdesign':
            continue
        ans = json.load(open(os.path.join(ROOT, 'assets/answers', tid + '.json'), encoding='utf-8'))['answers']
        qs = []
        for it in idx['topics'][tid]['items']:
            qs.append({'n': it['n'], 'q': it['q'], 'd': it['d'], 'm': it.get('m', 0), 'a': ans.get(it['id'], '')})
        data[tid] = {'name': idx['topics'][tid]['name'], 'qs': qs}
    data['sysdesign'] = idx['topics']['sysdesign']
    return data

CSS_LINK = '<link rel="stylesheet" href="/assets/topic-pages.css"/>'
FONTS = '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>'
GA = """<script async src="https://www.googletagmanager.com/gtag/js?id=G-61G11MD574"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-61G11MD574');</script>"""

def head(title, desc, slug, ld):
    url = SITE + '/' + slug
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
{CSS_LINK}
{GA}
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<nav class="tp-nav"><a href="/" class="tp-logo"><img src="/assets/logo.png" alt="Droidly" width="32" height="32"/>Droidly</a>
<div class="tp-links"><a href="/questions">Questions</a><a href="/roadmap">Roadmap</a><a href="/practice">Practice</a></div>
<a class="tp-cta" href="/roadmap" onclick="try{{gtag('event','topic_page_cta',{{at:'nav'}})}}catch(e){{}}">Get my plan</a></nav>
"""

def ld_for(title, desc, slug, crumb):
    return [
        {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Droidly', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Android interview questions', 'item': SITE + '/questions'},
            {'@type': 'ListItem', 'position': 3, 'name': crumb, 'item': SITE + '/' + slug}]},
        {'@context': 'https://schema.org', '@type': 'Article', 'headline': title, 'description': desc,
         'mainEntityOfPage': SITE + '/' + slug, 'dateModified': TODAY.isoformat(),
         'author': {'@type': 'Person', 'name': AUTHOR[0], 'url': AUTHOR[1], 'jobTitle': 'Android engineer'},
         'publisher': {'@type': 'Organization', 'name': 'Droidly', 'logo': {'@type': 'ImageObject', 'url': SITE + '/assets/logo.png'}}},
    ]

def byline(extra=''):
    return (f'<p class="tp-by">By <a href="{AUTHOR[1]}" target="_blank" rel="noopener">{AUTHOR[0]}</a>, Android engineer · '
            f'Updated {TODAY.strftime("%B %Y")}{extra} · <a href="/accuracy">How answers are checked</a></p>')

def more_topics(current):
    links = ''.join(f'<a href="/{TOPICS[t][0]}">{esc(TOPICS[t][1])}</a>' for t in ORDER if t != current)
    if current != 'sysdesign':
        links += f'<a href="/{SD_SLUG}">Android System Design Interview Questions</a>'
    return (f'<section class="tp-more"><h2>More Android interview topics</h2><div class="tp-grid">{links}</div>'
            f'<p><a class="tp-all" href="/questions">See all 600+ questions in the question bank</a></p></section>')

FOOT = """<footer class="tp-foot"><a href="/" class="tp-logo"><img src="/assets/logo.png" alt="" width="24" height="24"/>Droidly</a>
<span>Android interview prep, built by an Android engineer.</span>
<span class="tp-foot-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:support@droidly.io">support@droidly.io</a></span></footer>
</body>
</html>
"""

def topic_page(tid, d):
    slug, h1, intro, covers, concept = TOPICS[tid]
    qs = d['qs']; n = len(qs)
    cnt = {k: sum(1 for q in qs if q['d'] == k) for k in ('easy', 'medium', 'hard')}
    most = sum(q['m'] for q in qs)
    title = f'{h1} and Answers | Droidly'
    if len(title) > 65: title = f'{h1} | Droidly'
    desc = f'{n} {h1.replace(" Interview Questions", "")} interview questions with answers and Kotlin code: {covers}. Free.'
    if tid == 'hr': desc = f'{n} behavioral interview questions for Android developers, with sample answers: {covers}. Free.'
    if len(desc) > 160: desc = desc[:-len(' Free.')]
    assert len(desc) <= 160, desc
    diff = ' · '.join(f'{cnt[k]} {k}' for k in ('easy', 'medium', 'hard') if cnt[k])
    toc = ''.join(f'<li><a href="#q{q["n"]}">{esc(q["q"])}</a>{" <em>Most asked</em>" if q["m"] else ""}</li>' for q in qs)
    body = []
    for i, q in enumerate(qs, 1):
        bank = f'/questions?topic={tid}&amp;q={q["n"]}#{tid}'
        body.append(f'<section class="tp-q" id="q{q["n"]}"><div class="tp-chips"><span class="tp-d {q["d"]}">{q["d"].capitalize()}</span>'
                    f'{"<span class=tp-m>Most asked</span>" if q["m"] else ""}</div>'
                    f'<h2>{i}. {esc(q["q"])}</h2><div class="tp-a">{q["a"]}</div>'
                    f'<p class="tp-qfoot"><a href="{bank}">Mark it done or save it in the question bank</a> · <a href="#top">Back to top</a></p></section>')
        if i == 10:
            body.append(practice_box(tid, h1))
    learn = (f'<a href="/roadmap#topic/{tid}">Read the lessons for this topic</a>' +
             (f'<a href="/{concept}">Deep dive: {esc(d["name"])} concepts</a>' if concept else ''))
    out = head(title, desc, slug, ld_for(title, desc, slug, h1)) + f"""<main class="tp-wrap" id="top">
<nav class="tp-crumb" aria-label="Breadcrumb"><a href="/">Droidly</a><span>›</span><a href="/questions">Android interview questions</a><span>›</span><span>{esc(h1.replace(" Interview Questions", ""))}</span></nav>
<header class="tp-head"><h1>{esc(h1)}</h1><p class="tp-intro">{esc(intro)}</p>
{byline()}
<div class="tp-stats"><span><b>{n}</b> questions with answers</span><span>{diff}</span><span><b>{most}</b> marked most asked</span></div>
<div class="tp-learn">{learn}</div></header>
{practice_box(tid, h1, top=True)}
<section class="tp-toc"><h2>All {n} questions</h2><ol>{toc}</ol></section>
{''.join(body)}
{more_topics(tid)}
</main>
""" + FOOT
    return slug, out, title, desc

def practice_box(tid, h1, top=False):
    return (f'<aside class="tp-box"><div><b>{"Reading is not the same as answering." if top else "Remember these on interview day."}</b>'
            f'<span>Droidly picks 5 questions a day from your weak topics. Answer out loud, check the model answer, and the ones you miss come back until they stick. Free.</span></div>'
            f'<a href="/practice" onclick="try{{gtag(\'event\',\'topic_page_cta\',{{at:\'{"top" if top else "mid"}\',topic:\'{tid}\'}})}}catch(e){{}}">Start daily practice</a></aside>')

def sysdesign_page(sd):
    slug = SD_SLUG; h1 = 'Android System Design Interview Questions'
    title = 'Android System Design Interview Questions | Droidly'
    desc = f'{len(sd["items"])} Android system design interview walkthroughs: chat, feeds, payments, image loading, downloads, maps and more, plus a step-by-step way to answer them.'
    cards = []
    for it in sd['items']:
        key = it['href'].strip('/').replace('sysdesign_', '')
        page = open(os.path.join(ROOT, it['href'].strip('/') + '.html'), encoding='utf-8').read()
        h = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
        name = html.unescape(re.sub(r'<[^>]+>', '', h.group(1))).strip() if h else it['q']
        cards.append(f'<a class="tp-sd" href="{esc(it["href"])}"><b>{esc(name)}</b>'
                     f'<span>{esc(SD_DESC.get(key, ""))}</span><em class="tp-d {it["d"]}">{it["d"].capitalize()}</em></a>')
    steps = [
        ('Clarify the scope', 'Ask which screens and flows matter, who the users are, and whether you are designing the Android client, the backend, or both. Write down 3–5 functional requirements.'),
        ('Agree on the constraints', 'Offline support, network quality, battery, memory, app size, privacy and scale. On mobile these drive most of the design.'),
        ('Sketch the high-level design', 'Layers (UI, ViewModel, repository, local and remote data sources), how data flows between them, and which component owns the source of truth.'),
        ('Go deep on the hard parts', 'Pick the 2–3 problems that make this app difficult: sync and conflicts, pagination, caching, real-time updates, background work, or process death.'),
        ('Talk about trade-offs and edge cases', 'Explain what you chose and what you gave up, then cover failures: no network, slow network, app killed, duplicate requests, and how you would test and monitor it.'),
    ]
    st = ''.join(f'<li><b>{esc(a)}</b><span>{esc(b)}</span></li>' for a, b in steps)
    related = ''.join(f'<a href="/{TOPICS[t][0]}">{esc(TOPICS[t][1])}</a>' for t in ('architecture', 'networking', 'storage', 'performance', 'coroutines', 'android'))
    out = head(title, desc, slug, ld_for(title, desc, slug, h1)) + f"""<main class="tp-wrap" id="top">
<nav class="tp-crumb" aria-label="Breadcrumb"><a href="/">Droidly</a><span>›</span><a href="/questions">Android interview questions</a><span>›</span><span>System design</span></nav>
<header class="tp-head"><h1>{esc(h1)}</h1><p class="tp-intro">Senior Android interviews almost always include a system design round: design the Android client for a chat app, a feed, a payment flow or an image loader. These walkthroughs cover how to approach each one, from requirements to architecture, offline support and the edge cases interviewers probe.</p>
{byline()}</header>
<section class="tp-steps"><h2>How to answer an Android system design question</h2><ol>{st}</ol></section>
<section><h2 class="tp-h2">{len(sd["items"])} design walkthroughs</h2><div class="tp-sds">{''.join(cards)}</div></section>
{practice_box('sysdesign', h1, top=False)}
<section class="tp-more"><h2>Topics that come up in design rounds</h2><div class="tp-grid">{related}</div><p><a class="tp-all" href="/questions">See all 600+ questions in the question bank</a></p></section>
</main>
""" + FOOT
    return slug, out, title, desc

if __name__ == '__main__':
    data = load()
    made = []
    for tid in ORDER:
        slug, out, title, desc = topic_page(tid, data[tid])
        open(os.path.join(ROOT, slug + '.html'), 'w', encoding='utf-8').write(out); made.append((slug, title, desc))
    slug, out, title, desc = sysdesign_page(data['sysdesign'])
    open(os.path.join(ROOT, slug + '.html'), 'w', encoding='utf-8').write(out); made.append((slug, title, desc))
    for s, t, d in made:
        print(f'{s}.html  [{len(t)}] {t}\n    [{len(d)}] {d}')
