import { translate, type Locale, type TranslationKey } from "../i18n";
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

export type DuplicateReason =
  | "fullName"
  | "lastName"
  | "firstName"
  | "maidenName"
  | "nickname"
  | "birthYear"
  | "birthYearOverlap"
  | "deathYearOverlap";

export type DuplicateCandidate = DuplicatePerson & {
  score: number;
  reasons: string[];
  /** Stable codes for the reasons, so the UI can translate them again. */
  reasonCodes: DuplicateReason[];
};

const DUPLICATE_REASON_KEYS: Record<DuplicateReason, TranslationKey> = {
  fullName: "people.duplicate.reason.fullName",
  lastName: "people.duplicate.reason.lastName",
  firstName: "people.duplicate.reason.firstName",
  maidenName: "people.duplicate.reason.maidenName",
  nickname: "people.duplicate.reason.nickname",
  birthYear: "people.duplicate.reason.birthYear",
  birthYearOverlap: "people.duplicate.reason.birthYearOverlap",
  deathYearOverlap: "people.duplicate.reason.deathYearOverlap",
};

export function duplicateReasonKey(reason: DuplicateReason): TranslationKey {
  return DUPLICATE_REASON_KEYS[reason] ?? "people.duplicate.reason.fullName";
}

export function duplicateReasonLabel(
  reason: DuplicateReason,
  locale: Locale = "en",
) {
  return translate(locale, duplicateReasonKey(reason));
}

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
  locale: Locale = "en",
): { score: number; reasons: string[]; reasonCodes: DuplicateReason[] } {
  const reasons: string[] = [];
  const reasonCodes: DuplicateReason[] = [];
  let score = 0;

  const addReason = (code: DuplicateReason) => {
    reasonCodes.push(code);
    reasons.push(duplicateReasonLabel(code, locale));
  };

  const inputFull = fullName(input);
  const candidateFull = candidateName(candidate);

  if (inputFull && inputFull === candidateFull) {
    score += 60;
    addReason("fullName");
  } else if (
    normalizeName(input.lastName) &&
    normalizeName(input.lastName) === normalizeName(candidate.lastName)
  ) {
    score += 12;
    addReason("lastName");
  }

  if (normalizeName(input.firstName) === normalizeName(candidate.firstName)) {
    score += 10;
    addReason("firstName");
  }

  const maiden = normalizeName(input.maidenName);
  if (
    maiden &&
    (maiden === normalizeName(candidate.lastName) ||
      maiden === normalizeName(candidate.maidenName))
  ) {
    score += 18;
    addReason("maidenName");
  }

  const nickname = normalizeName(input.nickname);
  if (
    nickname &&
    (nickname === normalizeName(candidate.firstName) ||
      nickname === normalizeName(candidate.nickname))
  ) {
    score += 12;
    addReason("nickname");
  }

  const inputYear = fuzzyYear(input.birthDate);
  const candidateYear = fuzzyYear(candidate.birthDate);
  if (inputYear !== null && candidateYear !== null) {
    if (inputYear === candidateYear) {
      score += 35;
      addReason("birthYear");
    } else if (fuzzyDatesOverlap(input.birthDate, candidate.birthDate)) {
      score += 20;
      addReason("birthYearOverlap");
    }
  }

  if (
    input.deathDate &&
    candidate.deathDate &&
    fuzzyDatesOverlap(input.deathDate, candidate.deathDate)
  ) {
    score += 5;
    addReason("deathYearOverlap");
  }

  return { score, reasons, reasonCodes };
}

export function findDuplicateCandidates(
  input: DuplicateInput,
  candidates: DuplicatePerson[],
  options: {
    excludePersonId?: string | null;
    threshold?: number;
    limit?: number;
    locale?: Locale;
  } = {},
): DuplicateCandidate[] {
  const threshold = options.threshold ?? 55;
  const limit = options.limit ?? 5;
  const inputFull = fullName(input);
  if (!inputFull) return [];

  return candidates
    .filter(candidate => candidate.id !== options.excludePersonId)
    .map(candidate => {
      const scored = scoreDuplicate(input, candidate, options.locale ?? "en");
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
