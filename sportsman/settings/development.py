"""
Development settings for Sports-Man project.

DEBUG=True, SQLite database, relaxed security for local development.
"""
from .base import *  # noqa: F401, F403

DEBUG = True
SECRET_KEY = "django-insecure-dev-only-not-for-production-change-in-prod"

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# Allow browsable API in development
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]

# CORS - Allow all origins in development
CORS_ALLOW_ALL_ORIGINS = True
