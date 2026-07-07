/**
 * App context and mutable client state, seeded from the server's
 * authoritative GameState (json_script blocks in tracker.html).
 */
export const app = document.getElementById('tracker-app');

const seed = app ? JSON.parse(document.getElementById('game-state-data').textContent) : {};

export const GAME_ID = app ? app.dataset.gameId : null;
export const PLAYERS = app ? JSON.parse(document.getElementById('players-data').textContent) : [];
export const TEAM_ABBR = app ? app.dataset.teamAbbr : '';
export const OPPONENT = app ? app.dataset.opponent : '';
export const VIEWER_MODE = !!seed.viewer_mode;

export const state = {
    quarter: seed.quarter ?? 1,
    down: seed.down ?? null,
    distance: seed.distance ?? null,
    ball_position: seed.ball_position ?? null,
    los_position: seed.los_position ?? seed.ball_position ?? null,
    possession_team: seed.possession_team ?? null,
    situation: seed.situation ?? 'pregame',
    team_score: seed.team_score ?? 0,
    opponent_score: seed.opponent_score ?? 0,
    coin_toss_complete: !!seed.coin_toss_complete,
    version: seed.version ?? 0,
    last_sequence: seed.last_sequence ?? 0,
    currentForm: null,
    submitting: false,
};

/**
 * Adopt a serialized GameState from any server response (play result,
 * coin toss, quarter/score update, poll). Returns false when the payload
 * is stale (version not newer than what we already have).
 */
export function adoptServerState(server) {
    if (!server) return false;
    if (server.version <= state.version) return false;
    state.version = server.version;
    state.quarter = server.quarter;
    state.down = server.down;
    state.distance = server.distance;
    state.ball_position = server.ball_position;
    state.los_position = server.los_position;
    state.possession_team = server.possession;
    state.situation = server.situation;
    state.last_sequence = server.last_sequence;
    state.coin_toss_complete = server.situation !== 'pregame';
    return true;
}

// Penalties reference
export const PENALTIES = [
    { name: 'False Start', yards: 5, on_offense: true },
    { name: 'Holding (Offense)', yards: 10, on_offense: true },
    { name: 'Holding (Defense)', yards: 5, on_offense: false, auto_first: true },
    { name: 'Pass Interference (Off)', yards: 10, on_offense: true },
    { name: 'Pass Interference (Def)', yards: 0, on_offense: false, auto_first: true, spot_foul: true },
    { name: 'Delay of Game', yards: 5, on_offense: true },
    { name: 'Encroachment', yards: 5, on_offense: false },
    { name: 'Offsides', yards: 5, on_offense: false },
    { name: 'Illegal Formation', yards: 5, on_offense: true },
    { name: 'Illegal Motion', yards: 5, on_offense: true },
    { name: 'Illegal Shift', yards: 5, on_offense: true },
    { name: 'Illegal Block in Back', yards: 10, on_offense: true },
    { name: 'Clipping', yards: 15, on_offense: true },
    { name: 'Chop Block', yards: 15, on_offense: true },
    { name: 'Facemask', yards: 15, on_offense: false, auto_first: true },
    { name: 'Roughing the Passer', yards: 15, on_offense: false, auto_first: true },
    { name: 'Roughing the Kicker', yards: 15, on_offense: false, auto_first: true },
    { name: 'Unnecessary Roughness', yards: 15, on_offense: false, auto_first: true },
    { name: 'Unsportsmanlike Conduct', yards: 15, on_offense: false },
    { name: 'Personal Foul', yards: 15, on_offense: false, auto_first: true },
    { name: 'Horse Collar Tackle', yards: 15, on_offense: false, auto_first: true },
    { name: 'Intentional Grounding', yards: 0, on_offense: true, loss_of_down: true },
    { name: 'Ineligible Receiver', yards: 5, on_offense: true },
    { name: 'Illegal Contact', yards: 5, on_offense: false, auto_first: true },
    { name: 'Neutral Zone Infraction', yards: 5, on_offense: false },
    { name: 'Too Many Men on Field', yards: 5, on_offense: true },
    { name: 'Targeting', yards: 15, on_offense: false, auto_first: true },
];
