from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('snaps', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='defensesnap',
            name='opponent_play_type',
            field=models.CharField(
                blank=True,
                choices=[('RUN', 'Run'), ('PASS', 'Pass'), ('PUNT', 'Punt'), ('FG', 'Field Goal'), ('KICKOFF', 'Kickoff')],
                default='',
                help_text='Type of play the opponent ran on this snap',
                max_length=10,
            ),
        ),
    ]
