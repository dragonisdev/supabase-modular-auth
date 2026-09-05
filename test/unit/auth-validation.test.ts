import {
  AUTH_CONSTANTS,
  registerSchema as sharedRegisterSchema,
  strongPasswordSchema as sharedStrongPasswordSchema,
  usernameSchema,
} from "@supabase-modular-auth/types";
import { describe, expect, it } from "vitest";

import {
  createUserBodySchema,
  updateUserBodySchema,
} from "../../backend/src/validators/admin.validator.ts";
import { registerSchema as backendRegisterSchema } from "../../backend/src/validators/auth.validator.ts";

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

  it("rejects empty, control-character, and oversized display names", () => {
    expect(usernameSchema.safeParse("   ").success).toBe(false);
    expect(usernameSchema.safeParse("Ada\nLovelace").success).toBe(false);
    expect(
      usernameSchema.safeParse("a".repeat(AUTH_CONSTANTS.MAX_USERNAME_LENGTH + 1)).success,
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

  it("enforces backend password-strength checks for public and admin writes", () => {
    expect(
      backendRegisterSchema.safeParse({
        email: "weak-password@example.com",
        password: "a".repeat(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH),
      }).success,
    ).toBe(false);
    expect(
      createUserBodySchema.safeParse({
        email: "weak-admin-password@example.com",
        password: "a".repeat(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH),
      }).success,
    ).toBe(false);
    expect(updateUserBodySchema.safeParse({ password: strongPassword }).success).toBe(true);
  });
});
