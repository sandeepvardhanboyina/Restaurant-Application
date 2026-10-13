"""Generate local credentials and the Kubernetes Secret without external packages."""
import json
import secrets
from pathlib import Path


def prepare(root: Path) -> None:
    env_file = root / '.env'
    secret_file = root / 'k8s' / 'secret.yaml'
    if not env_file.exists():
        if secret_file.exists():
            raise ValueError('Restore the matching .env before regenerating an existing Secret.')
        values = {
            'MYSQL_DATABASE': 'restaurant',
            'MYSQL_USER': 'restaurant',
            'MYSQL_PASSWORD': secrets.token_hex(24),
            'MYSQL_ROOT_PASSWORD': secrets.token_hex(24),
            'DB_HOST': 'mysql',
            'DB_PORT': '3306',
            'ADMIN_USERNAME': 'admin',
            'ADMIN_PASSWORD': secrets.token_urlsafe(18),
            'JWT_SECRET': secrets.token_hex(32),
            'SEED_MENU': 'true',
        }
        env_file.write_text(''.join(f'{k}={v}\n' for k, v in values.items()), encoding='utf-8')

    values = dict(line.split('=', 1) for line in env_file.read_text(encoding='utf-8-sig').splitlines()
                  if line.strip() and not line.lstrip().startswith('#') and '=' in line)
    keys = ['MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'ADMIN_PASSWORD', 'JWT_SECRET']
    if not all(values.get(key) for key in keys):
        raise ValueError('Fill all credential fields in .env.')
    if len(values['ADMIN_PASSWORD']) < 12 or len(values['JWT_SECRET']) < 32:
        raise ValueError('ADMIN_PASSWORD needs 12+ characters; JWT_SECRET needs 32+.')
    for key, expected in [('MYSQL_DATABASE', 'restaurant'), ('MYSQL_USER', 'restaurant'),
                          ('ADMIN_USERNAME', 'admin')]:
        if values.get(key) != expected:
            raise ValueError(f'{key} must match the supplied ConfigMap value: {expected}')
    header = 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: restaurant-secrets\ntype: Opaque\nstringData:\n'
    secret_file.write_text(header + ''.join(f'  {key}: {json.dumps(values[key])}\n' for key in keys), encoding='utf-8')
    print('Credentials ready. Admin username: admin. Read ADMIN_PASSWORD in .env.')


if __name__ == '__main__':
    try:
        prepare(Path(__file__).resolve().parents[1])
    except ValueError as error:
        raise SystemExit(str(error)) from None
