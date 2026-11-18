import {
  findDuplicateCandidates,
  type DuplicatePerson,
} from "./duplicates";
import type { GedcomImportResult } from "./gedcom-import";
import type { PersonSex } from "./person-sex";
import type { FuzzyDate } from "./fuzzy-date";

export type MatchPerson = {
  id: string;
  firstName: string;
  lastName: string;
  maidenName: string | null;
  nickname: string | null;
  displayName: string;
  birthDate: FuzzyDate | null;
  deathDate: FuzzyDate | null;
  sex: PersonSex;
};

export type GedcomMatchSuggestion = {
  xref: string;
  personId: string | null;
  displayName: string | null;
  score: number;
  reasons: string[];
};

/**
 * Scores every imported person against the people already in the tree. This is
 * a suggestion only: no decision is applied until the user reviews it.
 */
export function suggestGedcomMatches(
  parsed: GedcomImportResult,
  existing: MatchPerson[],
): Map<string, GedcomMatchSuggestion> {
  const candidates: DuplicatePerson[] = existing.map(person => ({
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    maidenName: person.maidenName,
    nickname: person.nickname,
    birthDate: person.birthDate,
    deathDate: person.deathDate,
    displayName: person.displayName,
  }));

  const suggestions = new Map<string, GedcomMatchSuggestion>();
  for (const person of parsed.people) {
    const matches = findDuplicateCandidates(
      {
        firstName: person.firstName,
        lastName: person.lastName,
        maidenName: person.maidenName,
        nickname: person.nickname,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
      },
      candidates,
      { limit: 1, threshold: 40 },
    );
    const top = matches[0] ?? null;
    suggestions.set(person.xref, {
      xref: person.xref,
      personId: top?.id ?? null,
      displayName: top?.displayName ?? null,
      score: top?.score ?? 0,
      reasons: top?.reasons ?? [],
    });
  }
  return suggestions;
}

/**
 * A same name and birth year is strong enough to default to a merge in the
 * review UI. Everything else defaults to creating a new person, so nothing is
 * combined without the user changing the decision.
 */
export function defaultImportDecision(suggestion: GedcomMatchSuggestion) {
  if (
    suggestion.personId &&
    (suggestion.score >= 90 || suggestion.reasons.includes("Same full name"))
  ) {
    return { action: "merge" as const, personId: suggestion.personId };
  }
  return { action: "create" as const, personId: null };
}
