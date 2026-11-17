import {
  fuzzyDatesOverlap,
  fuzzyYear,
  type FuzzyDate,
} from "./fuzzy-date";

export type DuplicateInput = {
  firstName: string;
  lastName?: string | null;
  maidenName?: string | null;
  nickname?: string | null;
  birthDate?: FuzzyDate | null;
  deathDate?: FuzzyDate | null;
};

export type DuplicatePerson = DuplicateInput & {
  id: string;
  displayName: string;
};

export type DuplicateCandidate = DuplicatePerson & {
  score: number;
  reasons: string[];
};

export function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fullName(input: DuplicateInput) {
  return normalizeName(`${input.firstName} ${input.lastName ?? ""}`);
}

function candidateName(candidate: DuplicatePerson) {
  return normalizeName(`${candidate.firstName} ${candidate.lastName ?? ""}`);
}

export function scoreDuplicate(
  input: DuplicateInput,
  candidate: DuplicatePerson,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const inputFull = fullName(input);
  const candidateFull = candidateName(candidate);

  if (inputFull && inputFull === candidateFull) {
    score += 60;
    reasons.push("Same full name");
  } else if (
    normalizeName(input.lastName) &&
    normalizeName(input.lastName) === normalizeName(candidate.lastName)
  ) {
    score += 12;
    reasons.push("Same last name");
  }

  if (normalizeName(input.firstName) === normalizeName(candidate.firstName)) {
    score += 10;
    reasons.push("Same first name");
  }

  const maiden = normalizeName(input.maidenName);
  if (
    maiden &&
    (maiden === normalizeName(candidate.lastName) ||
      maiden === normalizeName(candidate.maidenName))
  ) {
    score += 18;
    reasons.push("Maiden name matches");
  }

  const nickname = normalizeName(input.nickname);
  if (
    nickname &&
    (nickname === normalizeName(candidate.firstName) ||
      nickname === normalizeName(candidate.nickname))
  ) {
    score += 12;
    reasons.push("Nickname matches");
  }

  const inputYear = fuzzyYear(input.birthDate);
  const candidateYear = fuzzyYear(candidate.birthDate);
  if (inputYear !== null && candidateYear !== null) {
    if (inputYear === candidateYear) {
      score += 35;
      reasons.push("Same birth year");
    } else if (fuzzyDatesOverlap(input.birthDate, candidate.birthDate)) {
      score += 20;
      reasons.push("Birth years overlap");
    }
  }

  if (
    input.deathDate &&
    candidate.deathDate &&
    fuzzyDatesOverlap(input.deathDate, candidate.deathDate)
  ) {
    score += 5;
    reasons.push("Death years overlap");
  }

  return { score, reasons };
}

export function findDuplicateCandidates(
  input: DuplicateInput,
  candidates: DuplicatePerson[],
  options: {
    excludePersonId?: string | null;
    threshold?: number;
    limit?: number;
  } = {},
): DuplicateCandidate[] {
  const threshold = options.threshold ?? 55;
  const limit = options.limit ?? 5;
  const inputFull = fullName(input);
  if (!inputFull) return [];

  return candidates
    .filter(candidate => candidate.id !== options.excludePersonId)
    .map(candidate => {
      const scored = scoreDuplicate(input, candidate);
      return { ...candidate, ...scored };
    })
    .filter(candidate => candidate.score >= threshold)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit);
}
