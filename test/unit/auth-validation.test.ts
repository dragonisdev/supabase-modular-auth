import {
  AUTH_CONSTANTS,
  forgotPasswordSchema,
  loginSchema as sharedLoginSchema,
  registerSchema as sharedRegisterSchema,
  registerFormSchema,
  resetPasswordFormSchema,
  resetPasswordSchema as sharedResetPasswordSchema,
  resetTokenSchema,
  strongPasswordSchema as sharedStrongPasswordSchema,
  usernameSchema,
} from "@supabase-modular-auth/types";
import { describe, expect, it } from "vitest";

import {
  createUserBodySchema,
  updateUserBodySchema,
} from "../../backend/src/validators/admin.validator.ts";
import {
  loginSchema as backendLoginSchema,
  registerSchema as backendRegisterSchema,
  resetPasswordSchema,
} from "../../backend/src/validators/auth.validator.ts";

const strongPassword = "correct horse battery staple";
const validResetToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

describe("authentication input validation", () => {
  it("accepts and trims an international display name", () => {
    const username = "  Zoë O'Connor — 東京 👋  ";

    expect(usernameSchema.parse(username)).toBe("Zoë O'Connor — 東京 👋");
    expect(
      sharedRegisterSchema.parse({
        email: "USER@example.com",
        password: strongPassword,
        username,
      }).username,
    ).toBe("Zoë O'Connor — 東京 👋");
    expect(
      backendRegisterSchema.parse({
        email: "USER@example.com",
        password: strongPassword,
        username,
      }).username,
    ).toBe("Zoë O'Connor — 東京 👋");
  });

  it("normalizes display names to NFC", () => {
    expect(usernameSchema.parse("Cafe\u0301")).toBe("Café");
  });

  it("trims and lowercases email addresses before validation output", () => {
    const input = "  USER@Example.com  ";

    expect(
      sharedRegisterSchema.parse({ email: input, password: strongPassword, username: "User" })
        .email,
    ).toBe("user@example.com");
    expect(sharedLoginSchema.parse({ email: input, password: "password" }).email).toBe(
      "user@example.com",
    );
    expect(
      backendRegisterSchema.parse({ email: input, password: strongPassword, username: "User" })
        .email,
    ).toBe("user@example.com");
    expect(backendLoginSchema.parse({ email: input, password: "password" }).email).toBe(
      "user@example.com",
    );
  });

  it("rejects empty, invisible, control-character, nonstandard-whitespace, and oversized display names", () => {
    expect(usernameSchema.safeParse("   ").success).toBe(false);
    expect(usernameSchema.safeParse("Ada\nLovelace").success).toBe(false);
    expect(usernameSchema.safeParse("Ada\n").success).toBe(false);
    expect(usernameSchema.safeParse("\u200B").success).toBe(false);
    expect(usernameSchema.safeParse("Ada\u200DLovelace").success).toBe(false);
    expect(usernameSchema.safeParse("\u202Eadmin").success).toBe(false);
    expect(usernameSchema.safeParse("\u2800").success).toBe(false);
    expect(usernameSchema.safeParse("\u3164").success).toBe(false);
    expect(usernameSchema.safeParse("Ada\u00A0Lovelace").success).toBe(false);
    expect(usernameSchema.safeParse("\u00A0Ada").success).toBe(false);
    expect(
      usernameSchema.safeParse("a".repeat(AUTH_CONSTANTS.MAX_USERNAME_LENGTH + 1)).success,
    ).toBe(false);
  });

  it("requires a username for registration", () => {
    const registrationWithoutUsername = { email: "user@example.com", password: strongPassword };

    expect(sharedRegisterSchema.safeParse(registrationWithoutUsername).success).toBe(false);
    expect(backendRegisterSchema.safeParse(registrationWithoutUsername).success).toBe(false);
    expect(
      registerFormSchema.safeParse({
        ...registrationWithoutUsername,
        confirmPassword: strongPassword,
      }).success,
    ).toBe(false);
  });

  it("requires valid reset-token structure for shared reset requests", () => {
    expect(
      sharedResetPasswordSchema.safeParse({
        password: strongPassword,
        token: validResetToken,
      }).success,
    ).toBe(true);

    for (const token of [
      `!${validResetToken}`,
      `${validResetToken}!`,
      validResetToken.replace(".", "!"),
    ]) {
      const result = resetTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
      expect(sharedResetPasswordSchema.safeParse({ password: strongPassword, token }).success).toBe(
        false,
      );
    }

    expect(sharedResetPasswordSchema.safeParse({ password: strongPassword }).success).toBe(false);
  });

  it.each([
    [9, false],
    [10, true],
    [2048, true],
    [2049, false],
  ] as const)(
    "checks reset-token length independently of structure at %i characters",
    (length, accepted) => {
      const token = `a.b.${"c".repeat(length - 4)}`;
      expect(resetTokenSchema.safeParse(token).success).toBe(accepted);
      for (const schema of [sharedResetPasswordSchema, resetPasswordSchema]) {
        const result = schema.safeParse({ password: strongPassword, token });
        expect(result.success).toBe(accepted);
        if (!result.success) {
          expect(result.error.issues.map((issue) => issue.path)).toEqual([["token"]]);
        }
      }
    },
  );

  it("requires and normalizes the email for password-recovery requests", () => {
    expect(forgotPasswordSchema.parse({ email: " USER@Example.com " }).email).toBe(
      "user@example.com",
    );
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("requires matching confirmation passwords in both client forms", () => {
    const registerInput = {
      email: "user@example.com",
      username: "Valid User",
      password: strongPassword,
      confirmPassword: strongPassword,
    };
    const resetInput = {
      password: strongPassword,
      confirmPassword: strongPassword,
      token: validResetToken,
    };

    expect(registerFormSchema.safeParse(registerInput).success).toBe(true);
    expect(resetPasswordFormSchema.safeParse(resetInput).success).toBe(true);

    for (const [schema, input] of [
      [registerFormSchema, { ...registerInput, confirmPassword: "different password" }],
      [resetPasswordFormSchema, { ...resetInput, confirmPassword: "different password" }],
    ] as const) {
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ["confirmPassword"], message: "Passwords do not match" }),
        );
      }
    }

    expect(registerFormSchema.safeParse({ ...registerInput, confirmPassword: "" }).success).toBe(
      false,
    );
    expect(resetPasswordFormSchema.safeParse({ ...resetInput, confirmPassword: "" }).success).toBe(
      false,
    );
  });

  it("applies the same display-name rule to admin create and update requests", () => {
    expect(
      createUserBodySchema.parse({
        email: "admin-created@example.com",
        password: strongPassword,
        username: "  Renée D.  ",
      }).username,
    ).toBe("Renée D.");
    expect(updateUserBodySchema.parse({ username: "  Kōji 山田  " }).username).toBe("Kōji 山田");
    expect(updateUserBodySchema.safeParse({ username: "Admin\u202E" }).success).toBe(false);
  });

  it("preserves passwords exactly while enforcing shared length bounds", () => {
    const passwordWithSpaces = `  ${"x".repeat(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH - 2)}`;

    expect(sharedStrongPasswordSchema.parse(passwordWithSpaces)).toBe(passwordWithSpaces);
    expect(
      sharedStrongPasswordSchema.safeParse("x".repeat(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH - 1))
        .success,
    ).toBe(false);
    expect(
      sharedStrongPasswordSchema.safeParse("x".repeat(AUTH_CONSTANTS.MAX_PASSWORD_LENGTH + 1))
        .success,
    ).toBe(false);
  });

  it.each([
    ["abcdefghij123!", false], // zxcvbn score 2
    ["abc123ABC!xyz", true], // zxcvbn score 3: kills >= becoming >
  ])("enforces the strength boundary for every password write: %s", (password, accepted) => {
    const input = {
      email: "user@example.com",
      username: "Valid User",
      token: validResetToken,
      password,
    };
    for (const schema of [
      backendRegisterSchema,
      resetPasswordSchema,
      createUserBodySchema,
      updateUserBodySchema,
    ]) {
      const result = schema.safeParse(input);
      expect(result.success).toBe(accepted);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.path)).toEqual([["password"]]);
      }
    }
  });
});
