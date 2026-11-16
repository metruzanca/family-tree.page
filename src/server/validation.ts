import { z } from "zod";
import {
  isValidFuzzyDate,
  isValidPartialDate,
  type FuzzyDate,
} from "../lib/fuzzy-date";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform(value => (value ? value : null));

const partialDateSchema = z
  .object({
    year: z.number().int().min(1, "Enter a year between 1 and 9999.").max(9999).nullable().default(null),
    month: z.number().int().min(1, "Choose a month between 1 and 12.").max(12).nullable().default(null),
    day: z.number().int().min(1, "Choose a day between 1 and 31.").max(31).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (!isValidPartialDate(value)) {
      context.addIssue({
        code: "custom",
        message: "That date does not exist.",
      });
    }
  });

export const fuzzyDateSchema = z
  .object({
    start: partialDateSchema,
    end: partialDateSchema.nullable().optional(),
    qualifier: z.enum(["exact", "about", "before", "after", "between", "unknown"]),
  })
  .superRefine((value, context) => {
    if (value.qualifier === "between" && !value.end) {
      context.addIssue({
        code: "custom",
        path: ["end"],
        message: "Choose an end date for the range.",
      });
    }
    if (!isValidFuzzyDate(value as FuzzyDate)) {
      context.addIssue({
        code: "custom",
        message: "That date is not valid.",
      });
    }
  })
  .transform(
    (value): FuzzyDate => ({
      start: value.start,
      end: value.qualifier === "between" ? (value.end ?? null) : null,
      qualifier: value.qualifier,
    }),
  );

const optionalFuzzyDate = fuzzyDateSchema
  .nullable()
  .optional()
  .transform(value => value ?? null);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter your email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(10, "Passwords must be at least 10 characters.")
  .max(200, "That password is too long.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(80, "That name is too long.");

export const registerSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  redirectTo: z.string().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200),
  redirectTo: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
});

export const emailChangeSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(200),
  confirmation: z.string().trim().min(1, "Type your email address to confirm.").max(254),
});

export const updateNotificationSettingsSchema = z.object({
  notifyBirthdayWeekBefore: z.boolean(),
  notifyBirthdayDayBefore: z.boolean(),
  notifyBirthdayDayOf: z.boolean(),
});

export const treeSchema = z.object({
  name: z.string().trim().min(1, "Give your tree a name.").max(80, "That name is too long."),
  description: z
    .string()
    .trim()
    .max(500, "That description is too long.")
    .optional()
    .nullable()
    .transform(value => (value ? value : null)),
});

export const treeRoleSchema = z.enum(["owner", "editor", "viewer"]);

export const inviteSchema = z.object({
  treeId: z.string().uuid(),
  role: z.enum(["owner", "editor", "viewer"]),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export const inviteEmailSchema = emailSchema;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "That reset link is not valid.").max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(values => values.password === values.confirmPassword, {
    message: "Those passwords do not match.",
    path: ["confirmPassword"],
  });

export const personSchema = z.object({
  treeId: z.string().uuid(),
  firstName: z.string().trim().min(1, "Enter a first name.").max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  maidenName: optionalText(80),
  nickname: optionalText(80),
  birthDate: optionalFuzzyDate,
  deathDate: optionalFuzzyDate,
  birthPlace: optionalText(160),
  deathPlace: optionalText(160),
  bio: optionalText(4000),
});

export const personUpdateSchema = personSchema.omit({ treeId: true });

export const personEventKindSchema = z.enum([
  "residence",
  "occupation",
  "education",
  "military",
  "immigration",
  "emigration",
  "burial",
  "other",
]);

export const personEventInputSchema = z
  .object({
    kind: personEventKindSchema.default("other"),
    title: optionalText(120),
    place: optionalText(160),
    date: optionalFuzzyDate,
    description: optionalText(2000),
  })
  .superRefine((value, context) => {
    if (!value.title && !value.date && !value.place) {
      context.addIssue({
        code: "custom",
        message: "Add a date, a title, or a place.",
      });
    }
    if (value.kind === "other" && !value.title) {
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: "Name this event.",
      });
    }
  });

export const personEventSchema = personEventInputSchema.and(
  z.object({
    treeId: z.string().uuid(),
    personId: z.string().uuid(),
  }),
);

export const personEventUpdateSchema = personEventInputSchema.and(
  z.object({
    treeId: z.string().uuid(),
    eventId: z.string().uuid(),
  }),
);

export const parentTypeSchema = z.enum([
  "biological",
  "adoptive",
  "foster",
  "step",
  "unknown",
]);

export const partnershipStatusSchema = z.enum([
  "married",
  "partnered",
  "divorced",
  "separated",
  "widowed",
  "unknown",
]);

export const parentChildSchema = z.object({
  treeId: z.string().uuid(),
  parentId: z.string().uuid(),
  childId: z.string().uuid(),
  parentType: parentTypeSchema.default("biological"),
});

export const partnershipSchema = z.object({
  treeId: z.string().uuid(),
  personAId: z.string().uuid(),
  personBId: z.string().uuid(),
  status: partnershipStatusSchema.default("partnered"),
  startDate: optionalFuzzyDate,
  endDate: optionalFuzzyDate,
});

export const addRelativeSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    treeId: z.string().uuid(),
    anchorPersonId: z.string().uuid(),
    relation: z.enum(["parent", "child", "partner"]),
    personId: z.string().uuid(),
    otherParentId: z.string().uuid().optional(),
    parentType: parentTypeSchema.default("biological"),
    status: partnershipStatusSchema.default("partnered"),
  }),
  z.object({
    mode: z.literal("new"),
    treeId: z.string().uuid(),
    anchorPersonId: z.string().uuid(),
    relation: z.enum(["parent", "child", "partner"]),
    otherParentId: z.string().uuid().optional(),
    person: personUpdateSchema,
    parentType: parentTypeSchema.default("biological"),
    status: partnershipStatusSchema.default("partnered"),
  }),
]);

export const fileGroupSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the album a name.").max(80, "That name is too long."),
});

export const renameFileGroupSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().trim().min(1, "Give the album a name.").max(80, "That name is too long."),
});

export const prepareUploadSchema = z.object({
  treeId: z.string().uuid(),
  personId: z.string().uuid(),
  groupId: z.string().uuid().optional().nullable(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  thumbMime: z.enum(["image/webp", "image/jpeg"]).optional().nullable(),
  width: z.number().int().positive().max(50_000).optional().nullable(),
  height: z.number().int().positive().max(50_000).optional().nullable(),
  takenAt: optionalFuzzyDate,
});

export const fileTagsSchema = z.object({
  treeId: z.string().uuid(),
  fileId: z.string().uuid(),
  personIds: z
    .array(z.string().uuid())
    .max(50, "That is too many people for one photo.")
    .default([])
    .transform(ids => [...new Set(ids)]),
});

export const fileTakenAtSchema = z.object({
  treeId: z.string().uuid(),
  fileId: z.string().uuid(),
  takenAt: optionalFuzzyDate,
});

export type PersonInput = z.infer<typeof personUpdateSchema>;
export type PersonEventInput = z.infer<typeof personEventInputSchema>;
