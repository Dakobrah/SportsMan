"""
ASGI config for Sports-Man project.

It exposes the ASGI callable as a module-level variable named ``application``.
"""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sportsman.settings.development")

application = get_asgi_application()
