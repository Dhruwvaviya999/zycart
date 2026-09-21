import { AlertTriangle } from 'lucide-react';

/**
 * Form-level failures — a rejected sign-in, a rate limit, an unreachable API.
 * Field-level problems belong beside their field; this is for everything else.
 */
export function AuthError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="text-small flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 font-medium text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
