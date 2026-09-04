/** A fully-populated Snap, for the pure modules that read one. */
import type { Player, Snap } from '../../src/lib/db/repositories/types';

export function makeSnap(overrides: Partial<Snap> = {}): Snap {
  return {
    id: 1, gameId: 1, kind: 'RUN',
    sequenceNumber: 1, quarter: 1, possession: 'us', gameClockSeconds: null,
    down: 1, distance: 10, ballPosition: -25, formation: '', playId: null, notes: '',
    yardsGained: 0, isTouchdown: false, isFirstDown: false,
    fumbled: false, fumbleLost: false, fumbleRecoveredById: null,
    ballCarrierId: null, ballCarrierNumber: null,
    quarterbackId: null, quarterbackNumber: null, targetId: null,
    receiverId: null, receiverNumber: null, isComplete: false,
    airYards: 0, yardsAfterCatch: 0, isInterception: false, isThrownAway: false,
    wasUnderPressure: false, wasSacked: false, sackYards: 0,
    defenseResult: null, secondaryFormation: '', primaryPlayerId: null,
    tackleYards: null, tackleForLoss: false, appliedPressure: false,
    forcedIncompletion: false, interceptionReturnYards: null,
    fumbleReturnYards: null, isDefensiveTouchdown: false,
    kickerId: null, kickerNumber: null, holderId: null, result: null,
    isTouchback: false, outOfBounds: false,
    punterId: null, punterNumber: null, puntYards: 0, hangTimeSeconds: null, isBlocked: false,
    downedAtYardLine: null,
    kickYards: 0, isOnsideKick: false, onsideRecovered: false,
    kickDistance: null,
    attemptType: null, passerId: null,
    hadPenalty: false, penaltyPlayerId: null, penaltyYards: null,
    penaltyDescription: '', penaltyOnOffense: null, penaltyAccepted: null,
    createdAt: '2026-09-04 12:00:00', updatedAt: '2026-09-04 12:00:00',
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 1, teamId: 1, firstName: 'Alex', lastName: 'Danforth',
    position: 'RB', number: 22, isActive: true,
    createdAt: '2026-09-04 12:00:00', updatedAt: '2026-09-04 12:00:00',
    ...overrides,
  };
}
