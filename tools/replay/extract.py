"""
Extract one nflverse game into a compact fixture for the replay test.

Real player names never reach the repository: each is mapped to a stable
synthetic surname and a jersey number drawn from the range its position
normally wears. The football -- downs, yardage, turnovers, scores -- is real.
"""
import csv, json, sys
from collections import OrderedDict

csv.field_size_limit(10_000_000)

GAME = sys.argv[1] if len(sys.argv) > 1 else '2024_16_PHI_WAS'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'app/tests/fixtures/replay.game.json'

SURNAMES = [
    'Abbott','Barlow','Cortez','Danforth','Ellery','Fenwick','Grayson','Hollis',
    'Ivers','Jessup','Kendrick','Lomax','Mercer','Nyland','Okafor','Pruitt',
    'Quill','Rhodes','Sable','Thorne','Underwood','Vance','Whitlock','Yarrow',
    'Ziegler','Ashford','Brannon','Calder','Dunmore','Easton','Faircloth','Gable',
]
FIRST = ['Alex','Sam','Jordan','Casey','Riley','Drew','Quinn','Avery','Reese','Emerson']

# Jersey ranges by the role the name appears in.
RANGES = {'passer': (1, 19), 'rusher': (20, 49), 'receiver': (10, 89),
          'kicker': (1, 19), 'punter': (1, 19)}
POSITION = {'passer': 'QB', 'rusher': 'RB', 'receiver': 'WR',
            'kicker': 'K', 'punter': 'P'}

def num(value, default=None):
    if value in ('', 'NA', None):
        return default
    try:
        f = float(value)
        return int(f) if f == int(f) else f
    except ValueError:
        return default

def flag(value):
    return value == '1'

people = OrderedDict()   # real name -> {name, number, position, team}
used = {}                # team -> set of numbers

def anonymise(real, role, team):
    if not real or real == 'NA':
        return None
    if real in people:
        return people[real]
    lo, hi = RANGES.get(role, (1, 99))
    taken = used.setdefault(team, set())
    number = next((n for n in range(lo, hi + 1) if n not in taken), None)
    if number is None:
        number = next(n for n in range(0, 100) if n not in taken)
    taken.add(number)
    index = len(people)
    people[real] = {
        'name': f'{FIRST[index % len(FIRST)]} {SURNAMES[index % len(SURNAMES)]}',
        'number': number,
        'position': POSITION.get(role, 'WR'),
        'team': team,
    }
    return people[real]

plays, home, away = [], None, None
with open('.pbp-cache/pbp2024.csv', newline='') as f:
    for row in csv.DictReader(f):
        if row['game_id'] != GAME:
            continue
        home, away = row['home_team'], row['away_team']
        pos = row['posteam']
        if not pos:
            continue

        actors = {}
        for role, col in (('passer', 'passer_player_name'), ('rusher', 'rusher_player_name'),
                          ('receiver', 'receiver_player_name'), ('kicker', 'kicker_player_name'),
                          ('punter', 'punter_player_name')):
            person = anonymise(row[col], role, pos)
            if person:
                actors[role] = person['number']

        plays.append({
            'id': num(row['play_id']),
            'qtr': num(row['qtr']),
            'drive': num(row['drive']),
            'posteam': pos,
            'defteam': row['defteam'],
            'yardline_100': num(row['yardline_100']),
            'down': num(row['down']),
            'ydstogo': num(row['ydstogo']),
            'play_type': row['play_type'],
            'yards_gained': num(row['yards_gained'], 0),
            'touchdown': flag(row['touchdown']),
            'td_team': row['td_team'] or None,
            'return_touchdown': flag(row['return_touchdown']),
            'interception': flag(row['interception']),
            'fumble_lost': flag(row['fumble_lost']),
            'sack': flag(row['sack']),
            'complete_pass': flag(row['complete_pass']),
            'field_goal_result': row['field_goal_result'] or None,
            'extra_point_result': row['extra_point_result'] or None,
            'two_point_conv_result': row['two_point_conv_result'] or None,
            'punt_blocked': flag(row['punt_blocked']),
            'touchback': flag(row['touchback']),
            'safety': flag(row['safety']),
            'penalty_yards': num(row['penalty_yards']),
            'penalty_team': row['penalty_team'] or None,
            'home_score': num(row['total_home_score'], 0),
            'away_score': num(row['total_away_score'], 0),
            'actors': actors,
        })

roster = [
    {'name': p['name'], 'number': p['number'], 'position': p['position'], 'team': p['team']}
    for p in people.values()
]
fixture = {'game': GAME, 'home': home, 'away': away, 'roster': roster, 'plays': plays}
with open(OUT, 'w') as f:
    json.dump(fixture, f, indent=0)
print(f'{GAME}: {len(plays)} plays, {len(roster)} players -> {OUT}')
print('final:', away, plays[-1]['away_score'], '-', home, plays[-1]['home_score'])
