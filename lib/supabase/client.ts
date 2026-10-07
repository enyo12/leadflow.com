import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

/**
 * Supabase client for Client Components.
 *
 * createBrowserClient already uses a module-level singleton, so this is safe
 * to call from multiple components.
 */
export function createClient() {
  const { url, key } = getSupabaseConfig();
  return createBrowserClient(url, key);
}
