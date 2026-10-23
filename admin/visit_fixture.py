"""Neutral footprint responses for existing, unrelated browser feature fixtures."""
from urllib.parse import urlsplit,parse_qs

def visit_response(method,url,body=None):
    u=urlsplit(url)
    if u.path=='/api/visits' and method=='POST':
        return {'ok':True,'target':(body or {}).get('target'),'recorded':False,'day':'2031-01-02','timezone':'Asia/Shanghai'}
    if u.path=='/api/visits' and method=='GET':
        target=parse_qs(u.query).get('target',['section:index'])[0]
        return {'ok':True,'available':True,'target':target,'day':'2031-01-02','timezone':'Asia/Shanghai','limit':20,
          'machine_views':0,'human_views':0,'web_views':0,'recent_machines':[],'recent_scope':'today' if target.startswith('home:') else 'last_30_days'}
    if u.path=='/api/me/visit-settings' and method=='GET':return {'ok':True,'stealth':False}
    return None

def fulfill_visit_fixture(route,include_identity=False):
    request=route.request
    body=request.post_data_json if request.post_data else None
    value=visit_response(request.method,request.url,body)
    if value is None and include_identity and request.method=='GET':
        path=urlsplit(request.url).path
        if path=='/api/config':value={'ok':True}
        if path=='/api/me':value={'ok':True,'signed_in':False}
    if value is None:return False
    route.fulfill(json=value);return True
