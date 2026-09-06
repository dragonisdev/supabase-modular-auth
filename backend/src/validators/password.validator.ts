import { strongPasswordSchema as baseStrongPasswordSchema } from "@supabase-modular-auth/types";
import zxcvbn from "zxcvbn";

export const strongPasswordSchema = baseStrongPasswordSchema.refine(
  (password) => zxcvbn(password).score >= 3,
  {
    message:
      "Password is too easy to guess. Use a longer, less predictable password or passphrase.",
  },
);
