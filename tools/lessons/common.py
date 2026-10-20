def L(title, body, points, code_title, code, tip, lang='kotlin'):
    d = {'title': title, 'body': body, 'points': points, 'tip': tip}
    if code:
        d['code'] = {'title': code_title, 'lang': lang, 'src': code.strip('\n')}
    return d

def A(title, url):
    return {'title': title, 'url': url, 'src': url.split('/')[2].replace('www.', '')}

def D(title, path):
    return {'title': title, 'url': path, 'src': 'Droidly'}
