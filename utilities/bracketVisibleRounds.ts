export function visibleBracketRounds(rounds: Map<number, any>): Map<number, any> {
  const visible = new Map<number, any>();
  for (const [number, round] of rounds) {
    const matches = Array.from({ length: round.length }, (_, index) => round[index]).filter((b: any) => b && !b.bye);
    if (matches.length) visible.set(number, matches);
  }
  return visible;
}

export function visibleBracketTarget(id: string | undefined, rounds: Map<number, any>): string | undefined {
  const byId = new Map<string, any>();
  for (const round of rounds.values()) {
    for (let index = 0; index < round.length; index++) {
      const b = round[index];
      if (b?.id) byId.set(b.id, b);
    }
  }
  const visited = new Set<string>();
  while (id && !visited.has(id)) {
    visited.add(id);
    const b = byId.get(id);
    if (!b?.bye) return id;
    id = b.parent_bracket?.id;
  }
  return undefined;
}
