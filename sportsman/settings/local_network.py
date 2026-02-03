"""
Local network deployment settings for Sports-Man project.

For hosting on a LAN where the app is accessed via IP or local hostname.
Optimized for trusted network environments (lab, home, small office).

Key differences from cloud production:
- HTTP allowed (HTTPS optional based on network security requirements)
- More permissive CORS for LAN access
- Longer session timeouts (users on trusted devices)
- Browsable API enabled for easier debugging
"""
import os
from datetime import timedelta
from .base import *  # noqa: F401, F403

DEBUG = os.environ.get("DEBUG", "False").lower() == "true"

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]

# Accept connections from any host on the network
# Configure via ALLOWED_HOSTS env var: "192.168.1.100,sportsman.local,localhost"
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost").split(",")

# PostgreSQL configuration
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "sportsman"),
        "USER": os.environ.get("DB_USER", "sportsman"),
        "PASSWORD": os.environ["DB_PASSWORD"],
        "HOST": os.environ.get("DB_HOST", "db"),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

# CORS - Allow all origins on local network (or specify)
if os.environ.get("CORS_ALLOWED_ORIGINS"):
    CORS_ALLOWED_ORIGINS = os.environ["CORS_ALLOWED_ORIGINS"].split(",")
else:
    CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True

# Enable browsable API for easier debugging on LAN
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]

# More generous rate limits for trusted local network
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
    "anon": "500/hour",
    "user": "5000/hour",
}

# Longer token lifetimes for local use
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

# Security settings for HTTP on trusted LAN
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Trust the nginx proxy
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = None

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
    },
}
