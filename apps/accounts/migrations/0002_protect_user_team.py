"""
Change User.team FK from SET_NULL to PROTECT.

Prevents silent coach lockout when a Team record is deleted while it still
has associated users.  Deleting such a team now raises django.db.models.deletion.ProtectedError
and forces the admin to reassign or clear team membership first.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('teams', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='team',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='users',
                to='teams.team',
            ),
        ),
    ]
