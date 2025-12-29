import { createClient, SupabaseClient } from "@supabase/supabase-js";
import config from "../config/env.js";

/**
 * Supabase Service
 *
 * Notes:
 * - getClient(): Uses ANON_KEY for client-facing operations (respects RLS)
 * - getAdminClient(): Uses SERVICE_ROLE_KEY for admin operations (bypasses RLS)
 * - getUserClient(): Creates authenticated client for specific user operations
 */
class SupabaseService {
  private static anonInstance: SupabaseClient | null = null;
  private static adminInstance: SupabaseClient | null = null;

  private constructor() {}

  /**
   * Get the anonymous client for client-facing auth operations
   * Uses ANON_KEY - respects Row Level Security (RLS)
   * Safe for: signUp, signIn, signOut, getUser, OAuth flows
   */
  public static getClient(): SupabaseClient {
    if (!SupabaseService.anonInstance) {
      SupabaseService.anonInstance = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });
    }
    return SupabaseService.anonInstance;
  }

  /**
   * Get the admin client for privileged operations
   * Uses SERVICE_ROLE_KEY - BYPASSES Row Level Security (RLS)
   *
   * WARNING: Use ONLY for:
   * - Admin user management (updateUserById, deleteUser)
   * - Signing out users by JWT
   * - Operations that require bypassing RLS
   *
   * NEVER use for regular auth operations
   */
  public static getAdminClient(): SupabaseClient {
    if (!SupabaseService.adminInstance) {
      SupabaseService.adminInstance = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        },
      );
    }
    return SupabaseService.adminInstance;
  }

  /**
   * Create a client authenticated as a specific user
   * Uses ANON_KEY with user's access token
   * Safe for: User-specific operations that need to respect RLS
   */
  public static getUserClient(accessToken: string): SupabaseClient {
    // Validate token format before using (basic sanity check)
    if (!accessToken || typeof accessToken !== "string" || accessToken.length < 10) {
      throw new Error("Invalid access token provided");
    }

    return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  /**
   * Clear cached instances (useful for testing or credential rotation)
   */
  public static clearInstances(): void {
    SupabaseService.anonInstance = null;
    SupabaseService.adminInstance = null;
  }
}

export default SupabaseService;
