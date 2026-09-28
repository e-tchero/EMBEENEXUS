/**
 * Typed fetch helpers for the customer wizard client components.
 *
 * The wizard talks to the existing API routes with `credentials: 'include'`
 * so the httpOnly Supabase auth cookies ride along. `referrerPolicy` keeps
 * the URL bar's query string (tx_ref etc.) out of cross-origin requests.
 */

/** Uniform API error shape returned by the app's route handlers. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Options for {@link apiFetch}. */
interface ApiFetchOptions {
  method: 'GET' | 'POST';
  /** JSON-serializable body (POST only). */
  body?: unknown;
  /** Optional abort signal. */
  signal?: AbortSignal;
}

/** JSON fetch against an app API route; throws {@link ApiError} on failure. */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions,
): Promise<T> {
  const response = await fetch(path, {
    method: options.method,
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    referrerPolicy: 'no-referrer-when-downgrade',
    signal: options.signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON (proxy error page etc.) — handled below as a generic error.
  }

  const envelope = (payload ?? {}) as { ok?: boolean; error?: string };
  if (!response.ok || envelope.ok !== true) {
    throw new ApiError(envelope.error ?? 'unknown_error', response.status);
  }
  return payload as T;
}

/** Friendly copy for API error codes surfaced in the wizard UI. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'out_of_coverage':
        return 'One or both locations are outside our Abuja delivery zone.';
      case 'distance_exceeds_maximum':
        return 'This trip is longer than our 35 km maximum delivery distance.';
      case 'maps_unavailable':
        return 'We could not measure this trip right now. Please try again.';
      case 'quote_expired':
        return 'That quote expired. Request a fresh quote to continue.';
      case 'quote_not_active':
        return 'That quote is no longer available. Request a fresh quote to continue.';
      case 'invalid_order_state':
        return 'This order is not in a state that allows that action right now.';
      case 'prerequisite_missing':
        return 'A required step has not been completed for this order yet.';
      case 'not_found':
        return 'We could not find that record for your account.';
      case 'forbidden':
        return 'Your account does not have access to this action.';
      case 'unauthenticated':
        return 'Your session expired. Please sign in again.';
      case 'provider_error':
        return 'The payment provider is unavailable right now. Please try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
