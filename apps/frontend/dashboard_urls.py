"""
Dashboard URL configuration.
"""
from django.urls import path
from . import dashboard

app_name = 'dashboard'

urlpatterns = [
    path('', dashboard.home, name='home'),
]
