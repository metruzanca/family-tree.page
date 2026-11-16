import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform(value => (value ? value : null));

const optionalDate = z
  .string()
  .trim()
  .regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Use a date like 1952-04-18.")
  .optional()
  .nullable()
  .transform(value => (value ? value : null));

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
  birthDate: optionalDate,
  deathDate: optionalDate,
  birthPlace: optionalText(160),
  deathPlace: optionalText(160),
  bio: optionalText(4000),
});

export const personUpdateSchema = personSchema.omit({ treeId: true });

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
  startDate: optionalDate,
  endDate: optionalDate,
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
});

export type PersonInput = z.infer<typeof personUpdateSchema>;
