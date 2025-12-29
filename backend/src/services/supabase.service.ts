import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config/env.js';

class SupabaseService {
  // Create a client for admin operations (service role)
  public static getAdminClient(): SupabaseClient {
    return createClient(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );
  }
  private static instance: SupabaseClient;

  private constructor() {}

  public static getClient(): SupabaseClient {
    if (!SupabaseService.instance) {
      SupabaseService.instance = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
          }
        }
      );
    }
    return SupabaseService.instance;
  }

  // Create a client for user-specific operations
  public static getUserClient(accessToken: string): SupabaseClient {
    return createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );
  }
}

export default SupabaseService;
