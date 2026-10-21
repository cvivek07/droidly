def L(title, body, points, code_title, code, tip, lang='kotlin'):
    d = {'title': title, 'body': body, 'points': points, 'tip': tip}
    if code:
        d['code'] = {'title': code_title, 'lang': lang, 'src': code.strip('\n')}
    return d

def A(title, url):
    return {'title': title, 'url': url, 'src': url.split('/')[2].replace('www.', '')}

def D(title, path):
    return {'title': title, 'url': path, 'src': 'Droidly'}

def S(h, paras, code=None):
    d = {'h': h, 'p': paras}
    if code:
        t, src = code[0], code[1]
        d['code'] = {'title': t, 'lang': code[2] if len(code) > 2 else 'kotlin', 'src': src.strip('\n')}
    return d

def X(sections, mistakes, qa):
    return {'deep': sections, 'mistakes': [{'bad': b, 'good': g} for b, g in mistakes], 'qa': {'q': qa[0], 'a': qa[1]}}
