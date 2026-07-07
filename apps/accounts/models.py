"""
Custom user model with team association.
"""
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model with optional team association.
    """

    team = models.ForeignKey(
        "teams.Team",
        # PROTECT prevents silent coach lockout: deleting a team that still has
        # associated users raises ProtectedError, forcing explicit user reassignment
        # before the team record can be removed.
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="users",
    )

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.username
