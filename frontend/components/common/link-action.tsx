'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toErrorMessage } from '@/services/api';

type Phase = 'ready' | 'working' | 'done' | 'failed';

/**
 * The page behind a link in an email: one action, performed once.
 *
 * Verifying an address, confirming a subscription, leaving a list, switching
 * off reminders — each arrives as a link, and each is the same small screen:
 * do the thing, then say what happened in the server's own words.
 *
 * ## Automatic, or behind a button
 *
 * `automatic` runs the action as the page loads. That is right for verifying
 * an address or confirming a subscription, where the person clicking *is* the
 * consent. It is wrong for anything a mail scanner could trigger by previewing
 * a link — some security gateways open every link in every message — so an
 * opt-out waits for a real click instead.
 *
 * ## Once, even in development
 *
 * A single-use token must be sent exactly once. React's development mode runs
 * effects twice, and the second request would spend nothing and report a
 * failure over a success. The ref survives that double invocation, so the
 * request does not.
 */
export function LinkAction({
  action,
  automatic,
  confirmLabel,
  workingLabel,
  next,
  onDone,
}: {
  action: () => Promise<string>;
  automatic: boolean;
  /** The button, when the action waits for one. */
  confirmLabel?: string;
  workingLabel: string;
  /** Where to go afterwards. */
  next: { href: string; label: string }[];
  /** After a success — to refresh a session-dependent page, say. */
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(automatic ? 'working' : 'ready');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  /** Records the outcome. State changes only when the request settles. */
  function settle(request: Promise<string>) {
    request.then(
      (text) => {
        setMessage(text);
        setPhase('done');
        onDone?.();
      },
      (cause: unknown) => {
        setMessage(toErrorMessage(cause));
        setPhase('failed');
      },
    );
  }

  /** The button's path: the only one that has to show "working" itself. */
  function run() {
    if (started.current) return;
    started.current = true;

    setPhase('working');
    settle(action());
  }

  useEffect(() => {
    // An automatic action starts in "working" already, so nothing is set
    // here until the request answers.
    if (!automatic || started.current) return;
    started.current = true;

    settle(action());
    // Runs once on mount by design; the ref guards against the second
    // invocation development mode makes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center" aria-live="polite">
      {phase === 'working' && (
        <p className="text-small inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {workingLabel}
        </p>
      )}

      {phase === 'ready' && (
        <Button size="cta" variant="brand" onClick={run}>
          {confirmLabel ?? 'Continue'}
        </Button>
      )}

      {(phase === 'done' || phase === 'failed') && (
        <>
          {phase === 'done' ? (
            <CheckCircle2 className="mx-auto size-7 text-success" aria-hidden />
          ) : (
            <XCircle className="mx-auto size-7 text-destructive" aria-hidden />
          )}
          <p role={phase === 'failed' ? 'alert' : 'status'} className="text-small mt-3 text-pretty">
            {message}
          </p>
        </>
      )}

      {phase !== 'working' && next.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2">
          {next.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="focus-ring text-small rounded-sm font-medium text-brand hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
