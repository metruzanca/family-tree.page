import { translate, type Locale, type TranslationKey } from "../i18n";

export const PERSON_SEX_OPTIONS = [
  {
    value: "female",
    label: "Female",
    description: "Used for mother labels and GEDCOM SEX F.",
    gedcom: "F",
  },
  {
    value: "male",
    label: "Male",
    description: "Used for father labels and GEDCOM SEX M.",
    gedcom: "M",
  },
  {
    value: "other",
    label: "Other",
    description: "Exports as GEDCOM SEX U and neutral parent labels.",
    gedcom: "U",
  },
  {
    value: "unknown",
    label: "Unknown",
    description: "The default. Exports as GEDCOM SEX U.",
    gedcom: "U",
  },
] as const;

export type PersonSex = (typeof PERSON_SEX_OPTIONS)[number]["value"];

export const PERSON_SEX_VALUES = PERSON_SEX_OPTIONS.map(
  option => option.value,
) as [PersonSex, ...PersonSex[]];

const SEX_KEYS: Record<PersonSex, TranslationKey> = {
  female: "person.sex.female",
  male: "person.sex.male",
  other: "person.sex.other",
  unknown: "person.sex.unknown",
};

export function isPersonSex(value: unknown): value is PersonSex {
  return (
    typeof value === "string" &&
    PERSON_SEX_OPTIONS.some(option => option.value === value)
  );
}

export function personSexLabel(sex: PersonSex, locale: Locale = "en") {
  const key = SEX_KEYS[sex] ?? "person.sex.unknown";
  return translate(locale, key);
}

/** GEDCOM 7 adds X for other; unknown remains U in both versions. */
export function gedcomSex(
  sex: PersonSex,
  version: "5.5.1" | "7.0" = "5.5.1",
) {
  if (sex === "other") return version === "7.0" ? "X" : "U";
  return PERSON_SEX_OPTIONS.find(option => option.value === sex)?.gedcom ?? "U";
}
