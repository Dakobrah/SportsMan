# 08 — Deployment

← [07 — Testing](07-testing.md) | Next: [09 — Gotchas](09-gotchas.md)

---

## Docker Compose Stack

```yaml
# docker-compose.yml (summary)
services:
  db:
    image: postgres:16-alpine
    environment: {POSTGRES_DB: sportsman, POSTGRES_USER: sportsman, POSTGRES_PASSWORD: ...}
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck: {test: pg_isready -U sportsman, interval: 5s, retries: 5}

  web:
    build: .
    depends_on: {db: {condition: service_healthy}}
    environment:
      DJANGO_SETTINGS_MODULE: sportsman.settings.local_network
      DB_HOST: db
      DB_NAME: sportsman
      DB_USER: sportsman
      DB_PASSWORD: ${DB_PASSWORD}
      DJANGO_SECRET_KEY: ${DJANGO_SECRET_KEY}
      ALLOWED_HOSTS: ${ALLOWED_HOSTS:-localhost}
    volumes: [static_files:/app/staticfiles]

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    depends_on: [web]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - static_files:/static
```

---

## Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system deps (psycopg needs libpq)
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements/base.txt requirements/base.txt
RUN pip install --no-cache-dir -r requirements/base.txt

# Copy source
COPY . .

# Entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
```

**Important:** Only `requirements/base.txt` is installed in the image. Anything that needs to work in Docker (including WhiteNoise) must be in `base.txt`, not `production.txt`.

---

## `docker-entrypoint.sh`

```bash
#!/bin/bash
set -e

echo "Running migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting Gunicorn..."
exec gunicorn sportsman.wsgi \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
```

The entrypoint runs `migrate` and `collectstatic` every startup, which is safe for idempotent operations.

---

## Nginx Configuration

```nginx
# nginx.conf (summary)
upstream web {
    server web:8000;
}

server {
    listen 80;

    # Serve static files directly (30-day immutable cache)
    location /static/ {
        alias /static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Serve media files (7-day cache)
    location /media/ {
        alias /media/;
        expires 7d;
    }

    # Everything else → Gunicorn
    location / {
        proxy_pass http://web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    client_max_body_size 10M;
}
```

---

## Static File Serving Chain

```
1. Development (manage.py runserver + DEBUG=True):
   → Django serves /static/ directly from STATICFILES_DIRS=['static/']

2. Docker (DEBUG=False):

   a. collectstatic runs at container startup:
      static/ ──collectstatic──▶ staticfiles/  (hashed filenames)

   b. Port 8000 (direct Gunicorn — no Nginx):
      WhiteNoise middleware ──serves──▶ staticfiles/

   c. Port 80 (via Nginx):
      Nginx ──serves──▶ /static/ volume (staticfiles/ mounted)
      Everything else ──proxy_pass──▶ Gunicorn:8000
```

**WhiteNoise** must be in `MIDDLEWARE` above Django's `SecurityMiddleware` or just below it, and before any other middleware:

```python
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # ← right after security
    'django.contrib.sessions.middleware.SessionMiddleware',
    ...
]
```

---

## Settings Hierarchy

```
sportsman/settings/
├── base.py            # Shared — always loaded
│   ├── INSTALLED_APPS, MIDDLEWARE, TEMPLATES
│   ├── DRF: authentication, throttling, pagination, EXCEPTION_HANDLER
│   ├── SimpleJWT: ACCESS=8h, REFRESH=30d, ROTATE=True, BLACKLIST=True
│   └── drf-spectacular: title, version, schema path
│
├── development.py     # extend base; DEBUG=True; SQLite; CORS allow all
│   └── $ DJANGO_SETTINGS_MODULE=sportsman.settings.development python manage.py runserver
│
├── local_network.py   # extend base; DEBUG=False(default); PostgreSQL
│   ├── DATABASES from env: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
│   ├── ALLOWED_HOSTS from env: ALLOWED_HOSTS (comma-separated)
│   ├── JWT: ACCESS=12h, REFRESH=30d
│   ├── THROTTLE: anon=500/hr, user=5000/hr
│   └── $ DJANGO_SETTINGS_MODULE=sportsman.settings.local_network (Docker default)
│
├── production.py      # cloud production — extend local_network pattern
│   └── Additional security headers, cloud storage, etc.
│
└── test.py            # in-memory SQLite, MD5 hasher, no throttle, no logging
    └── $ DJANGO_SETTINGS_MODULE=sportsman.settings.test pytest (auto via pytest.ini)
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DJANGO_SETTINGS_MODULE` | Yes | — | Set in docker-compose.yml |
| `DJANGO_SECRET_KEY` | Yes | — | Django secret key |
| `DB_HOST` | Yes (local_network) | `db` | PostgreSQL host |
| `DB_NAME` | Yes | `sportsman` | Database name |
| `DB_USER` | Yes | `sportsman` | Database user |
| `DB_PASSWORD` | Yes | — | Database password |
| `ALLOWED_HOSTS` | Yes | `localhost` | Comma-separated hosts |
| `DEBUG` | No | `False` | Set to `True` for verbose errors |
| `CORS_ALLOWED_ORIGINS` | No | (all) | Comma-separated allowed origins |

Copy `.env.example` to `.env` and fill in values before running Docker Compose.

---

## Common Commands

```bash
# Start full stack
docker compose up -d

# View logs
docker compose logs -f web

# Run migrations (auto-run at startup, but also available manually)
docker compose exec web python manage.py migrate

# Open Django shell
docker compose exec web python manage.py shell

# Create superuser
docker compose exec web python manage.py createsuperuser

# Run tests (using local venv)
pytest

# Run specific test
pytest tests/unit/test_dashboard_metrics.py -v

# Apply pending migration
python manage.py migrate snaps 0002_defensesnap_opponent_play_type
```

---

## Docker Volume Notes

Volumes are mounted and owned by `root` inside the container. **Do not** add `USER appuser` to the Dockerfile when volumes need write access (e.g., `staticfiles` volume needs to be writable by the web container during `collectstatic`). See [09-gotchas.md](09-gotchas.md).

---

## Health Check

The `db` service uses a Docker health check so the `web` container only starts after PostgreSQL is ready:

```yaml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U sportsman"]
    interval: 5s
    timeout: 5s
    retries: 5
```

The `web` service uses `depends_on: {db: {condition: service_healthy}}`.

The Django app also exposes `/api/health/` which checks DB connectivity:

```
GET /api/health/
→ 200: {"status": "healthy", "database": "ok"}
→ 503: {"status": "unhealthy", "database": "<error>"}
```

---

→ Next: [09 — Gotchas & Known Issues](09-gotchas.md)
