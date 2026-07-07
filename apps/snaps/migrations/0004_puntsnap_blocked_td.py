# Generated manually — adds blocked_recovered_by and blocked_td to PuntSnap.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('snaps', '0003_unique_snap_sequence'),
    ]

    operations = [
        migrations.AddField(
            model_name='puntsnap',
            name='blocked_recovered_by',
            field=models.CharField(
                max_length=10,
                blank=True,
                default='',
                help_text="'us' if we recovered a blocked punt, 'opponent' otherwise",
            ),
        ),
        migrations.AddField(
            model_name='puntsnap',
            name='blocked_td',
            field=models.BooleanField(
                default=False,
                help_text='True when we returned a blocked punt for a touchdown',
            ),
        ),
    ]
