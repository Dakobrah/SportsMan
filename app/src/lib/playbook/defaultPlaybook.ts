/**
 * A starter playbook.
 *
 * Deliberately small and conventional: enough formations and calls to make
 * tendency reports meaningful on day one, few enough that a coach can read
 * the whole list on a phone. It is a starting point to edit, not a claim
 * about how anyone should play -- a real playbook is imported.
 *
 * Names follow common youth and high-school usage, which is the level this
 * app is built for.
 */
import type { UnitType } from '../db/repositories/types';

export interface PlaybookEntry {
  unitType: UnitType;
  formation: string;
  name: string;
  description?: string;
}

export const DEFAULT_PLAYBOOK: readonly PlaybookEntry[] = [
  // --- Offense -------------------------------------------------------------
  { unitType: 'OFF', formation: 'I Formation', name: 'Power Right' },
  { unitType: 'OFF', formation: 'I Formation', name: 'Power Left' },
  { unitType: 'OFF', formation: 'I Formation', name: 'Dive' },
  { unitType: 'OFF', formation: 'I Formation', name: 'Iso' },
  { unitType: 'OFF', formation: 'I Formation', name: 'Play Action Boot' },

  { unitType: 'OFF', formation: 'Singleback', name: 'Inside Zone' },
  { unitType: 'OFF', formation: 'Singleback', name: 'Outside Zone' },
  { unitType: 'OFF', formation: 'Singleback', name: 'Counter' },
  { unitType: 'OFF', formation: 'Singleback', name: 'Quick Slant' },
  { unitType: 'OFF', formation: 'Singleback', name: 'Curl Flat' },

  { unitType: 'OFF', formation: 'Shotgun', name: 'Zone Read' },
  { unitType: 'OFF', formation: 'Shotgun', name: 'Draw' },
  { unitType: 'OFF', formation: 'Shotgun', name: 'Bubble Screen' },
  { unitType: 'OFF', formation: 'Shotgun', name: 'Four Verticals' },
  { unitType: 'OFF', formation: 'Shotgun', name: 'Mesh' },
  { unitType: 'OFF', formation: 'Shotgun', name: 'Stick' },

  { unitType: 'OFF', formation: 'Trips Right', name: 'Flood' },
  { unitType: 'OFF', formation: 'Trips Right', name: 'Smash' },
  { unitType: 'OFF', formation: 'Trips Right', name: 'Jet Sweep' },

  { unitType: 'OFF', formation: 'Goal Line', name: 'QB Sneak' },
  { unitType: 'OFF', formation: 'Goal Line', name: 'Wedge' },
  { unitType: 'OFF', formation: 'Goal Line', name: 'Play Action Fade' },

  { unitType: 'OFF', formation: 'Wildcat', name: 'Sweep' },
  { unitType: 'OFF', formation: 'Victory', name: 'Kneel' },

  // --- Defense -------------------------------------------------------------
  { unitType: 'DEF', formation: '4-3', name: 'Cover 2' },
  { unitType: 'DEF', formation: '4-3', name: 'Cover 3' },
  { unitType: 'DEF', formation: '4-3', name: 'Man Free' },
  { unitType: 'DEF', formation: '3-4', name: 'Cover 3' },
  { unitType: 'DEF', formation: '3-4', name: 'Fire Zone' },
  { unitType: 'DEF', formation: 'Nickel', name: 'Cover 4' },
  { unitType: 'DEF', formation: 'Nickel', name: 'Corner Blitz' },
  { unitType: 'DEF', formation: 'Dime', name: 'Prevent' },
  { unitType: 'DEF', formation: 'Goal Line', name: 'Bear Front' },

  // --- Special teams -------------------------------------------------------
  { unitType: 'ST', formation: 'Punt', name: 'Standard Punt' },
  { unitType: 'ST', formation: 'Punt', name: 'Rugby Punt' },
  { unitType: 'ST', formation: 'Punt Return', name: 'Return Right' },
  { unitType: 'ST', formation: 'Punt Return', name: 'Block Attempt' },
  { unitType: 'ST', formation: 'Kickoff', name: 'Deep Kick' },
  { unitType: 'ST', formation: 'Kickoff', name: 'Squib' },
  { unitType: 'ST', formation: 'Kickoff', name: 'Onside' },
  { unitType: 'ST', formation: 'Kick Return', name: 'Middle Return' },
  { unitType: 'ST', formation: 'Field Goal', name: 'Field Goal' },
  { unitType: 'ST', formation: 'Field Goal', name: 'Fake Field Goal' },
  { unitType: 'ST', formation: 'PAT', name: 'Extra Point' },
  { unitType: 'ST', formation: 'PAT', name: 'Two Point Run' },
  { unitType: 'ST', formation: 'PAT', name: 'Two Point Pass' },
] as const;
