import 'server-only';

/**
 * Extracts the application business code from a supabase-js RPC error.
 *
 * Postgres surfaces `raise exception 'BUSINESS_CODE'` as SQLSTATE P0001
 * (generic raise_exception) with the business code carried in the error
 * MESSAGE. Raises annotated with `using errcode` surface that code in
 * `error.code` directly. Call sites that matched only on `error.code` saw
 * every business rejection as 'P0001' → generic unknown_error; this helper
 * restores the precise codes the RPCs were designed to communicate.
 */
export function rpcBusinessCode(
  error: { code?: string | null; message?: string | null } | null | undefined,
): string {
  if (!error) return '';
  const code = error.code ?? '';
  if (code !== '' && code !== 'P0001') return code;
  // First line of the message carries the business code for plain raises.
  return (error.message ?? '').trim().split('\n')[0]?.trim() ?? '';
}
