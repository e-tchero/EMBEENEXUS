/**
 * Uniform result shape for server actions.
 *
 * Server actions must never leak internal error details (stack traces, SQL
 * errors, provider messages) to the client. They return either a success
 * value or a single safe, human-readable message.
 */

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = { ok: false; error: string };

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function actionSuccess<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function actionFailure(error: string): ActionFailure {
  return { ok: false, error };
}
