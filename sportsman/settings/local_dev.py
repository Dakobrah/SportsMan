"""
Local sandbox override — same as development but with DB on local FS
so SQLite doesn't fail with disk I/O errors on the mounted drive.
"""
from .development import *  # noqa: F401, F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": "/sessions/elegant-gifted-hawking/db.sqlite3",
    }
}
