"""Integration checks against the real public endpoint and its MySQL database.

Run from the project root: python backend/smoke_test.py http://localhost:8088
Creates one served test order and one archived test dish; preserves order history.
"""
import json
import os
import sys
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


base = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8088').rstrip('/')
settings = {}
env_file = Path(__file__).resolve().parents[1] / '.env'
if env_file.exists():
    for line in env_file.read_text(encoding='utf-8-sig').splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            settings[key] = value
settings.update(os.environ)
token = ''


def call(path, method='GET', data=None, expected=200, authenticated=False):
    headers = {'Content-Type': 'application/json'}
    if authenticated:
        headers['Authorization'] = f'Bearer {token}'
    request = Request(base + '/api' + path, method=method, headers=headers,
                      data=json.dumps(data).encode() if data is not None else None)
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        assert response.status == expected, f'{method} {path}: expected {expected}, got {response.status}: {body!r}'
        return json.loads(body) if body else None


assert b'<div id="root">' in urlopen(base, timeout=10).read()
assert call('/health/ready')['database'] == 'connected'
categories = call('/categories')
assert categories and call('/menu'), 'First-run menu must be present in MySQL'
call('/admin/orders', expected=401)
call('/admin/menu', method='POST', data={}, expected=401)
call('/admin/login', method='POST', data={'username': 'admin', 'password': 'incorrect-password'}, expected=401)
token = call('/admin/login', method='POST', data={
    'username': settings.get('ADMIN_USERNAME', 'admin'), 'password': settings['ADMIN_PASSWORD']})['access_token']
call('/admin/orders', authenticated=True)
print('PASS public frontend, MySQL readiness, menu, and admin authentication')

original = {'name': f'Integration dish {uuid4().hex[:8]}', 'description': 'Created by the executable integration check.',
            'category_id': categories[0]['id'], 'price': '12.35', 'icon': '🍽️', 'vegetarian': True, 'available': True}
dish = call('/admin/menu', method='POST', data=original, expected=201, authenticated=True)
try:
    assert any(x['id'] == dish['id'] for x in call('/menu'))
    payload = {'request_id': str(uuid4()), 'table_number': 12, 'notes': 'Integration test order',
               'items': [{'menu_item_id': dish['id'], 'quantity': 2}]}
    invalid = {**payload, 'request_id': str(uuid4()), 'items': [{'menu_item_id': dish['id'], 'quantity': 0}]}
    call('/orders', method='POST', data=invalid, expected=422)
    call('/orders', method='POST', data={**payload, 'total': 0.01}, expected=422)
    order = call('/orders', method='POST', data=payload, expected=201)
    assert Decimal(str(order['total'])) == Decimal('24.70')
    repeated = call('/orders', method='POST', data=payload, expected=201)
    assert repeated['id'] == order['id'], 'Retried checkout created a duplicate order'
    call('/orders', method='POST', data={**payload, 'table_number': 13}, expected=409)
    assert call('/orders/' + order['id'])['status'] == 'pending'
    call('/admin/orders/' + order['id'], method='PATCH', data={'status': 'served'}, expected=401)
    call('/admin/orders/' + order['id'], method='PATCH', data={'status': 'served'}, expected=409, authenticated=True)
    print('PASS checkout, server prices, input validation, idempotency, and private tracking')

    updated = {**original, 'name': original['name'] + ' updated', 'price': '19.99', 'available': False}
    call('/admin/menu/' + str(dish['id']), method='PUT', data=updated, authenticated=True)
    call('/orders', method='POST', data={**payload, 'request_id': str(uuid4())}, expected=409)
    saved = call('/orders/' + order['id'])
    assert saved['items'][0]['name'] == original['name']
    assert Decimal(str(saved['total'])) == Decimal('24.70')
    for status in ['preparing', 'ready', 'served']:
        call('/admin/orders/' + order['id'], method='PATCH', data={'status': status}, authenticated=True)
        assert call('/orders/' + order['id'])['status'] == status
    call('/admin/orders/' + order['id'], method='PATCH', data={'status': 'pending'}, expected=409, authenticated=True)
    stats = call('/admin/summary', authenticated=True)
    assert stats['served'] >= 1 and Decimal(str(stats['revenue'])) >= Decimal('24.70')
    print('PASS menu edits, sold-out enforcement, price snapshots, status transitions, and dashboard totals')
finally:
    call('/admin/menu/' + str(dish['id']), method='DELETE', expected=204, authenticated=True)

assert not any(x['id'] == dish['id'] for x in call('/menu'))
assert call('/orders/' + order['id'])['items'][0]['name'] == original['name']
print('PASS menu removal preserves order history')
print(f'All integration checks passed. Test order: {order["id"]}')
