import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("auth.invalidEmail").max(320);

export const newPasswordSchema = z
  .string()
  .min(10, "auth.passwordTooShort")
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "auth.passwordNeedsLettersDigits");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  next: z.string().max(2048).optional(),
  tenant: z.string().max(63).optional(),
});

export const passwordPairSchema = z
  .object({ password: newPasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "auth.passwordsDontMatch", path: ["confirm"] });

export type FormState = { error?: string; success?: string; fieldErrors?: Record<string, string> } | undefined;
