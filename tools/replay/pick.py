"""Scan the nflverse play-by-play for a game with good variety to replay."""
import csv
from collections import defaultdict

csv.field_size_limit(10_000_000)
stats = defaultdict(lambda: {"plays": 0, "to": 0, "fg": 0, "td": 0, "punt": 0,
                             "pen": 0, "home": "", "away": "", "hs": 0, "as": 0})

with open('.pbp-cache/pbp2024.csv', newline='') as f:
    for row in csv.DictReader(f):
        g = stats[row['game_id']]
        g["plays"] += 1
        g["home"], g["away"] = row['home_team'], row['away_team']
        for key, col in (("hs", 'total_home_score'), ("as", 'total_away_score')):
            try:
                g[key] = max(g[key], int(float(row[col] or 0)))
            except ValueError:
                pass
        if row['interception'] == '1' or row['fumble_lost'] == '1':
            g["to"] += 1
        if row['play_type'] == 'field_goal':
            g["fg"] += 1
        if row['touchdown'] == '1':
            g["td"] += 1
        if row['play_type'] == 'punt':
            g["punt"] += 1
        if row['penalty_yards'] not in ('', 'NA'):
            g["pen"] += 1

best = sorted(stats.items(), key=lambda kv: -(kv[1]["to"] * 3 + kv[1]["fg"] + kv[1]["td"]))[:8]
for gid, s in best:
    print(f'{gid:22} {s["away"]}@{s["home"]} {s["as"]}-{s["hs"]}  '
          f'plays={s["plays"]:3} TO={s["to"]} FG={s["fg"]} TD={s["td"]} '
          f'punt={s["punt"]} pen={s["pen"]}')
