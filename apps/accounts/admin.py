"""
Admin configuration for accounts app.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ["username", "email", "team", "is_active", "is_staff"]
    list_filter = ["team", "is_active", "is_staff"]
    fieldsets = UserAdmin.fieldsets + (("Team", {"fields": ("team",)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Team", {"fields": ("team",)}),)
