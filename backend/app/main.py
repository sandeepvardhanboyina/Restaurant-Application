import hashlib
import hmac
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from .database import Base, engine, get_db, required
from .models import Category, MenuItem, Order, OrderItem
from .schemas import CategoryInput, Login, MenuInput, OrderInput, StatusInput
from .seed import seed_menu

logger = logging.getLogger('uvicorn.error')
admin_username = os.getenv('ADMIN_USERNAME', 'admin')
admin_password = required('ADMIN_PASSWORD')
jwt_secret = required('JWT_SECRET')
if len(admin_password) < 12 or len(jwt_secret) < 32:
    raise RuntimeError('ADMIN_PASSWORD needs at least 12 characters and JWT_SECRET at least 32')
password_hasher = PasswordHash.recommended()
admin_hash = password_hasher.hash(admin_password)
del admin_password
bearer = HTTPBearer(auto_error=False)
TRANSITIONS = {'pending': ['preparing', 'cancelled'], 'preparing': ['ready', 'cancelled'],
               'ready': ['served'], 'served': [], 'cancelled': []}


@asynccontextmanager
async def lifespan(app):
    # MySQL may still be initializing its persistent volume. Retry before serving traffic.
    for attempt in range(60):
        try:
            with engine.connect() as connection:
                if connection.scalar(text("SELECT GET_LOCK('restaurant_init', 30)")) != 1:
                    raise RuntimeError('Database initialization lock timed out')
                try:
                    Base.metadata.create_all(connection)
                    with Session(bind=connection) as session:
                        if os.getenv('SEED_MENU', 'true').lower() == 'true':
                            seed_menu(session)
                        session.commit()
                    connection.commit()
                finally:
                    connection.execute(text("SELECT RELEASE_LOCK('restaurant_init')"))
            break
        except OperationalError:
            if attempt == 59:
                raise
            logger.info('Waiting for MySQL (%s/60)', attempt + 1)
            time.sleep(2)
    yield
    engine.dispose()


app = FastAPI(title='Gather & Grain API', version='1.0.0', lifespan=lifespan,
              docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url=None)


@app.exception_handler(OperationalError)
async def database_unavailable(request, error):
    logger.error('Database operation failed (%s)', type(error).__name__)
    return JSONResponse(status_code=503, content={'detail': 'Database unavailable. Please retry shortly.'})


def require_admin(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    try:
        payload = jwt.decode(credentials.credentials if credentials else '', jwt_secret,
                             algorithms=['HS256'], audience='restaurant-admin',
                             options={'require': ['exp', 'sub', 'aud']})
        if payload['sub'] != admin_username:
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        raise HTTPException(401, 'Please sign in as an administrator.', headers={'WWW-Authenticate': 'Bearer'})


def menu_dict(item):
    return {field: getattr(item, field) for field in
            ('id', 'category_id', 'name', 'description', 'price', 'icon', 'vegetarian', 'available')}


def order_dict(order):
    return {'id': order.id, 'table_number': order.table_number, 'notes': order.notes,
            'status': order.status, 'total': order.total,
            'created_at': order.created_at.replace(tzinfo=timezone.utc).isoformat(),
            'items': [{'menu_item_id': line.menu_item_id, 'name': line.name,
                       'quantity': line.quantity, 'unit_price': line.unit_price} for line in order.items]}


@app.get('/api/health/live')
def live():
    return {'status': 'ok'}


@app.get('/api/health/ready')
def ready(db: Session = Depends(get_db)):
    db.execute(text('SELECT 1'))
    return {'status': 'ok', 'database': 'connected'}


@app.post('/api/admin/login')
def login(data: Login):
    valid_password = password_hasher.verify(data.password, admin_hash)
    if not (hmac.compare_digest(data.username.encode(), admin_username.encode()) and valid_password):
        raise HTTPException(401, 'Incorrect username or password.')
    token = jwt.encode({'sub': admin_username, 'aud': 'restaurant-admin',
                        'exp': datetime.now(timezone.utc) + timedelta(hours=2)}, jwt_secret, algorithm='HS256')
    return {'access_token': token, 'token_type': 'bearer'}


@app.get('/api/categories')
def categories(db: Session = Depends(get_db)):
    return [{'id': c.id, 'name': c.name} for c in db.scalars(select(Category).order_by(Category.id))]


@app.get('/api/menu')
def menu(db: Session = Depends(get_db)):
    return [menu_dict(item) for item in db.scalars(select(MenuItem).where(MenuItem.archived.is_(False)).order_by(MenuItem.id))]


@app.post('/api/orders', status_code=201)
def place_order(data: OrderInput, db: Session = Depends(get_db)):
    fingerprint = hashlib.sha256(json.dumps(data.model_dump(mode='json'), sort_keys=True).encode()).hexdigest()

    def previous_order():
        previous = db.scalar(select(Order).where(Order.request_id == str(data.request_id)))
        if previous:
            if previous.request_hash != fingerprint:
                raise HTTPException(409, 'This checkout reference was already used for a different order.')
            return order_dict(previous)
        return None

    previous = previous_order()
    if previous:
        return previous
    ids = [line.menu_item_id for line in data.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, 'Each menu item must appear only once in an order.')
    dishes = {dish.id: dish for dish in db.scalars(select(MenuItem).where(MenuItem.id.in_(ids)).with_for_update())}
    order = Order(id=str(uuid4()), request_id=str(data.request_id), request_hash=fingerprint,
                  table_number=data.table_number, notes=data.notes.strip(), total=Decimal('0.00'))
    for line in data.items:
        dish = dishes.get(line.menu_item_id)
        if not dish or dish.archived or not dish.available:
            raise HTTPException(409, 'An item is no longer available. Refresh the menu and update your cart.')
        order.items.append(OrderItem(menu_item_id=dish.id, name=dish.name,
                                     quantity=line.quantity, unit_price=dish.price))
        order.total += dish.price * line.quantity
    db.add(order)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        previous = previous_order()
        if previous:
            return previous
        raise
    db.refresh(order)
    return order_dict(order)


@app.get('/api/orders/{order_id}')
def get_order(order_id: UUID, db: Session = Depends(get_db)):
    order = db.get(Order, str(order_id))
    if not order:
        raise HTTPException(404, 'Order not found. Check your tracking ID.')
    return order_dict(order)


@app.post('/api/admin/categories', dependencies=[Depends(require_admin)], status_code=201)
def add_category(data: CategoryInput, db: Session = Depends(get_db)):
    category = Category(name=data.name)
    db.add(category)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'That category already exists.')
    return {'id': category.id, 'name': category.name}


@app.post('/api/admin/menu', dependencies=[Depends(require_admin)], status_code=201)
def add_menu_item(data: MenuInput, db: Session = Depends(get_db)):
    if not db.get(Category, data.category_id):
        raise HTTPException(422, 'Choose an existing category.')
    item = MenuItem(**data.model_dump())
    db.add(item)
    db.commit()
    return menu_dict(item)


@app.put('/api/admin/menu/{item_id}', dependencies=[Depends(require_admin)])
def update_menu_item(item_id: int, data: MenuInput, db: Session = Depends(get_db)):
    item = db.get(MenuItem, item_id)
    if not item or item.archived:
        raise HTTPException(404, 'Menu item not found.')
    if not db.get(Category, data.category_id):
        raise HTTPException(422, 'Choose an existing category.')
    for key, value in data.model_dump().items():
        setattr(item, key, value)
    db.commit()
    return menu_dict(item)


@app.delete('/api/admin/menu/{item_id}', dependencies=[Depends(require_admin)], status_code=204)
def delete_menu_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(MenuItem, item_id)
    if not item or item.archived:
        raise HTTPException(404, 'Menu item not found.')
    item.archived = True
    item.available = False
    db.commit()


@app.get('/api/admin/orders', dependencies=[Depends(require_admin)])
def all_orders(status: str | None = None, page: int = Query(1, ge=1), db: Session = Depends(get_db)):
    statement = select(Order)
    if status:
        if status not in TRANSITIONS:
            raise HTTPException(422, 'Unknown order status.')
        statement = statement.where(Order.status == status)
    count = db.scalar(select(func.count()).select_from(statement.subquery()))
    orders = db.scalars(statement.order_by(Order.created_at.desc()).offset((page - 1) * 20).limit(20))
    return {'items': [order_dict(o) for o in orders], 'total': count, 'page': page, 'page_size': 20}


@app.get('/api/admin/summary', dependencies=[Depends(require_admin)])
def summary(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Order.status, func.count()).group_by(Order.status)).all())
    revenue = db.scalar(select(func.coalesce(func.sum(Order.total), 0)).where(Order.status == 'served'))
    return {'orders': sum(counts.values()), 'active': sum(counts.get(s, 0) for s in ['pending', 'preparing', 'ready']),
            'served': counts.get('served', 0), 'revenue': revenue}


@app.patch('/api/admin/orders/{order_id}', dependencies=[Depends(require_admin)])
def change_status(order_id: UUID, data: StatusInput, db: Session = Depends(get_db)):
    order = db.scalar(select(Order).where(Order.id == str(order_id)).with_for_update())
    if not order:
        raise HTTPException(404, 'Order not found.')
    if data.status != order.status and data.status not in TRANSITIONS[order.status]:
        raise HTTPException(409, f'Cannot move an order from {order.status} to {data.status}. Refresh and try again.')
    order.status = data.status
    db.commit()
    return order_dict(order)
