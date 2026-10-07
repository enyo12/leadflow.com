/**
 * Shape of the sign-in / sign-up form state.
 *
 * Kept out of the "use server" actions module on purpose: a Client Component
 * that imports a non-action value from a server-action module drags the whole
 * module — including its server-only imports — into the client bundle.
 */
export interface AuthFormState {
  /** A message the user must act on. Always written by us, never raw from the API. */
  error: string | null;
  /** A non-blocking message, e.g. "check your email to confirm". */
  notice: string | null;
}

export const EMPTY_AUTH_STATE: AuthFormState = { error: null, notice: null };

export const MIN_PASSWORD_LENGTH = 8;
