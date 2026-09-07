/**
 * The route table.
 *
 * Order matters: `matchRoute` takes the first pattern that matches, so a
 * literal like '/games/new' must be declared before '/games/:id'.
 *
 * Report scope rides the query string (#/reports/post-game?game=3), which
 * the router already parses, so a report is linkable and survives a reload.
 */
import type { RouteDef } from '../lib/router';

import Home from './Home.svelte';
import Teams from './Teams.svelte';
import TeamForm from './TeamForm.svelte';
import Team from './Team.svelte';
import PlayerForm from './PlayerForm.svelte';
import Seasons from './Seasons.svelte';
import Games from './Games.svelte';
import GameForm from './GameForm.svelte';
import Game from './Game.svelte';
import Plays from './Plays.svelte';
import Tracker from './Tracker.svelte';
import Reports from './Reports.svelte';
import Report from './Report.svelte';
import Playbook from './Playbook.svelte';
import Backup from './Backup.svelte';
import NotFound from './NotFound.svelte';

export const routes: RouteDef[] = [
  { pattern: '/', component: Home },

  { pattern: '/teams', component: Teams },
  { pattern: '/teams/new', component: TeamForm },
  { pattern: '/teams/:id/edit', component: TeamForm },
  { pattern: '/teams/:id', component: Team },
  { pattern: '/teams/:teamId/players/new', component: PlayerForm },
  { pattern: '/players/:id/edit', component: PlayerForm },

  { pattern: '/seasons', component: Seasons },

  { pattern: '/games', component: Games },
  { pattern: '/games/new', component: GameForm },
  { pattern: '/games/:id/edit', component: GameForm },
  { pattern: '/games/:id/plays', component: Plays },
  // Full screen: no nav, the only way out is the back chevron.
  { pattern: '/games/:id/tracker', component: Tracker, chrome: false },
  { pattern: '/games/:id', component: Game },

  // A literal before its parameterised sibling: first match wins.
  { pattern: '/reports', component: Reports },
  { pattern: '/reports/:templateId', component: Report },

  { pattern: '/playbook', component: Playbook },
  { pattern: '/backup', component: Backup },

  { pattern: '*', component: NotFound },
];
