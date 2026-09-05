import {
  AUTH_CONSTANTS,
  loginSchema as sharedLoginSchema,
  registerSchema as sharedRegisterSchema,
  registerFormSchema,
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

  it("rejects empty, control-character, and oversized display names", () => {
    expect(usernameSchema.safeParse("   ").success).toBe(false);
    expect(usernameSchema.safeParse("Ada\nLovelace").success).toBe(false);
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

  it("applies the same display-name rule to admin create and update requests", () => {
    expect(
      createUserBodySchema.parse({
        email: "admin-created@example.com",
        password: strongPassword,
        username: "  Renée D.  ",
      }).username,
    ).toBe("Renée D.");
    expect(updateUserBodySchema.parse({ username: "  Kōji 山田  " }).username).toBe("Kōji 山田");
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
      token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl",
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
