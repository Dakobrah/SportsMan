/**
 * The penalty rulebook.
 *
 * A module rather than a table: these are rules, not user data. They must not
 * be exported in a backup, must not be migrated, and change with a release.
 * Keeping them out of the database also keeps the backup document at exactly
 * the tables that hold a coach's own work.
 *
 * Transcribed from static/js/tracker.js:25-53.
 */
export interface Penalty {
  readonly name: string;
  /** Standard enforcement. Zero means the yardage depends on the spot. */
  readonly yards: number;
  readonly onOffense: boolean;
  readonly autoFirstDown?: boolean;
  readonly spotFoul?: boolean;
  readonly lossOfDown?: boolean;
}

export const PENALTIES: readonly Penalty[] = [
  { name: 'False Start', yards: 5, onOffense: true },
  { name: 'Holding (Offense)', yards: 10, onOffense: true },
  { name: 'Holding (Defense)', yards: 5, onOffense: false, autoFirstDown: true },
  { name: 'Pass Interference (Off)', yards: 10, onOffense: true },
  { name: 'Pass Interference (Def)', yards: 0, onOffense: false, autoFirstDown: true, spotFoul: true },
  { name: 'Delay of Game', yards: 5, onOffense: true },
  { name: 'Encroachment', yards: 5, onOffense: false },
  { name: 'Offsides', yards: 5, onOffense: false },
  { name: 'Illegal Formation', yards: 5, onOffense: true },
  { name: 'Illegal Motion', yards: 5, onOffense: true },
  { name: 'Illegal Shift', yards: 5, onOffense: true },
  { name: 'Illegal Block in Back', yards: 10, onOffense: true },
  { name: 'Clipping', yards: 15, onOffense: true },
  { name: 'Chop Block', yards: 15, onOffense: true },
  { name: 'Facemask', yards: 15, onOffense: false, autoFirstDown: true },
  { name: 'Roughing the Passer', yards: 15, onOffense: false, autoFirstDown: true },
  { name: 'Roughing the Kicker', yards: 15, onOffense: false, autoFirstDown: true },
  { name: 'Unnecessary Roughness', yards: 15, onOffense: false, autoFirstDown: true },
  { name: 'Unsportsmanlike Conduct', yards: 15, onOffense: false },
  { name: 'Personal Foul', yards: 15, onOffense: false, autoFirstDown: true },
  { name: 'Horse Collar Tackle', yards: 15, onOffense: false, autoFirstDown: true },
  { name: 'Intentional Grounding', yards: 0, onOffense: true, lossOfDown: true },
  { name: 'Ineligible Receiver', yards: 5, onOffense: true },
  { name: 'Illegal Contact', yards: 5, onOffense: false, autoFirstDown: true },
  { name: 'Neutral Zone Infraction', yards: 5, onOffense: false },
  { name: 'Too Many Men on Field', yards: 5, onOffense: true },
  { name: 'Targeting', yards: 15, onOffense: false, autoFirstDown: true },
] as const;

export const findPenalty = (name: string): Penalty | undefined =>
  PENALTIES.find((penalty) => penalty.name === name);
