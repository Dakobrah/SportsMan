"""
Custom permissions for the Sports-Man API.
"""
from rest_framework import permissions


class IsTeamMember(permissions.BasePermission):
    """
    Object-level permission: user may only access objects that belong to their team.

    Walks common FK chains (obj.team, obj.season.team, obj.game.season.team) so it
    works uniformly across Game, Snap, and QuarterScore objects.  Staff users bypass
    the check entirely (they can administer any team).
    """

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff:
            return True
        user_team = getattr(request.user, "team", None)
        if hasattr(obj, "team"):
            return obj.team == user_team
        if hasattr(obj, "season"):
            return obj.season.team == user_team
        if hasattr(obj, "game"):
            return obj.game.season.team == user_team
        return True


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allow read-only access for all authenticated users.
    Write access only for staff/admin users.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_staff


class IsTeamMemberOrStaff(permissions.BasePermission):
    """
    View-level: any authenticated user may read.
    Object-level: only staff or a user belonging to the object's team may write.

    Use this on Season/Player viewsets where coaches manage their own team's roster
    but should not mutate another team's records.
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_staff:
            return True
        user_team = getattr(request.user, "team", None)
        if hasattr(obj, "team"):
            return obj.team == user_team
        if hasattr(obj, "season"):
            return obj.season.team == user_team
        return False


class IsRegistrationEnabled(permissions.BasePermission):
    """
    Allow access only when REGISTRATION_ENABLED=True in settings.
    Used to gate the public registration endpoint.
    """

    message = "Registration is currently disabled. Contact an administrator to create an account."

    def has_permission(self, request, view):
        from django.conf import settings
        return getattr(settings, "REGISTRATION_ENABLED", False)
