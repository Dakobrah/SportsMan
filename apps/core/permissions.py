"""
Custom permissions for the Sports-Man API.
"""
from rest_framework import permissions


class IsTeamMember(permissions.BasePermission):
    """
    Permission check for team membership.
    Users can only access data belonging to their team.
    """

    def has_object_permission(self, request, view, obj):
        # Check if the object has a team relationship
        if hasattr(obj, "team"):
            return obj.team == getattr(request.user, "team", None)
        if hasattr(obj, "season"):
            return obj.season.team == getattr(request.user, "team", None)
        if hasattr(obj, "game"):
            return obj.game.season.team == getattr(request.user, "team", None)
        return True


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Allow read-only access for authenticated users.
    Write access only for admin users.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_staff
