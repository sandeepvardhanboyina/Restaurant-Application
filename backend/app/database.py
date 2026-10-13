import os

from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def required(name: str) -> str:
    value = os.environ.get(name, '')
    if not value:
        raise RuntimeError(f'{name} must be configured')
    return value


class Base(DeclarativeBase):
    pass


engine = create_engine(
    URL.create(
        'mysql+pymysql',
        username=required('MYSQL_USER'), password=required('MYSQL_PASSWORD'),
        host=os.getenv('DB_HOST', 'mysql'), port=int(os.getenv('DB_PORT', '3306')),
        database=required('MYSQL_DATABASE'), query={'charset': 'utf8mb4'},
    ),
    pool_pre_ping=True, pool_recycle=300,
    connect_args={'connect_timeout': 5, 'read_timeout': 10, 'write_timeout': 10},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as session:
        yield session
