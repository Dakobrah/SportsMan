"""What the replay could not record, and why."""
import json
from collections import Counter

data = json.load(open('app/tests/fixtures/replay.game.json'))
kinds = Counter()
for p in data['plays']:
    blank = p['play_type'] in ('', None)
    bare_no_play = p['play_type'] == 'no_play' and p['penalty_yards'] is None
    if blank or bare_no_play:
        kinds[p['play_type'] or '(blank)'] += 1
        print(f"  q{p['qtr']} drive {p['drive']} {p['posteam']}: "
              f"type={p['play_type']!r} down={p['down']} ydstogo={p['ydstogo']} "
              f"yardline_100={p['yardline_100']} safety={p['safety']}")
print('skipped totals:', dict(kinds))
print('all play types:', dict(Counter(p['play_type'] for p in data['plays'])))
