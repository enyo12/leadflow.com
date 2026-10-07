"use server";

import { redirect } from "next/navigation";

import { MIN_PASSWORD_LENGTH, type AuthFormState } from "@/lib/auth-form";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export type { AuthFormState };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Translates Supabase auth errors into messages that are useful without
 * leaking database internals. Anything unrecognised falls through to a
 * generic message — the raw string is never shown to the user.
 */
function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "That email and password combination is not correct.";
  }
  if (text.includes("email not confirmed")) {
    return "Please confirm your email address before signing in. Check your inbox for the link.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (text.includes("password should be at least") || text.includes("password is too short")) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (text.includes("unable to validate email") || text.includes("invalid email")) {
    return "That does not look like a valid email address.";
  }
  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (text.includes("fetch") || text.includes("network") || text.includes("timeout")) {
    return "We could not reach the server. Check your connection and try again.";
  }

  return "Something went wrong while signing you in. Please try again.";
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = field(formData, "password");
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password.", notice: null };
  }
  if (!isValidEmail(email)) {
    return { error: "That does not look like a valid email address.", notice: null };
  }

  const supabase = await createClient();

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: friendlyAuthError(error.message), notice: null };
    }
  } catch {
    return {
      error: "We could not reach the server. Check your connection and try again.",
      notice: null,
    };
  }

  // redirect() throws, so it must stay outside the try/catch above.
  redirect(next ?? "/dashboard");
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = field(formData, "password");

  if (!email || !password) {
    return { error: "Enter your email and password.", notice: null };
  }
  if (!isValidEmail(email)) {
    return { error: "That does not look like a valid email address.", notice: null };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      notice: null,
    };
  }

  const supabase = await createClient();

  let hasSession = false;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { error: friendlyAuthError(error.message), notice: null };
    }
    hasSession = Boolean(data.session);
  } catch {
    return {
      error: "We could not reach the server. Check your connection and try again.",
      notice: null,
    };
  }

  // With "Confirm email" enabled Supabase creates the user but issues no
  // session, so we cannot redirect yet.
  if (!hasSession) {
    return {
      error: null,
      notice: "Account created. Check your inbox for a confirmation link, then sign in.",
    };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
