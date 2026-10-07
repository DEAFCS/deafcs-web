// Adapted from 5Stack WEB bd6c8150; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { e_team_roster_statuses_enum } from "~/generated/zeus";

export interface RosterMember {
  coach?: boolean | null;
  status?: e_team_roster_statuses_enum | string | null;
}

export interface TeamRosterBuckets<T extends RosterMember> {
  starters: T[];
  substitutes: T[];
  bench: T[];
  coaches: T[];
}

/**
 * Every member lands in exactly one bucket, the same way the full roster
 * (TeamMembers) groups them: a coach is listed under Coaches whatever status
 * the row carries. (DEAFCS: picking a playing status from the roster menu
 * clears `coach` in the same update, so a member who still has the flag is a
 * coach. 5Stack puts a playing coach in their slot's bucket instead.)
 */
export function teamRosterBuckets<T extends RosterMember>(
  roster: T[],
): TeamRosterBuckets<T> {
  const buckets: TeamRosterBuckets<T> = {
    starters: [],
    substitutes: [],
    bench: [],
    coaches: [],
  };

  for (const member of roster) {
    if (member.coach) {
      buckets.coaches.push(member);
    } else if (member.status === e_team_roster_statuses_enum.Starter) {
      buckets.starters.push(member);
    } else if (member.status === e_team_roster_statuses_enum.Substitute) {
      buckets.substitutes.push(member);
    } else if (member.status === e_team_roster_statuses_enum.Benched) {
      buckets.bench.push(member);
    }
  }

  return buckets;
}
