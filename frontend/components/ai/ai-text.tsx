import { Fragment } from 'react';
import { parseAiText, type AiInline } from '@/lib/ai-text';
import { cn } from '@/lib/utils';

/**
 * Renders an assistant reply.
 *
 * The model's output reaches the DOM as React text nodes and nothing else.
 * There is no `dangerouslySetInnerHTML` here and there must never be one: a
 * reply is untrusted text, and a `<script>` or an `onerror` inside it should
 * render as those characters rather than as behaviour.
 */
function Inline({ tokens }: { tokens: AiInline[] }) {
  return (
    <>
      {tokens.map((token, index) => (
        <Fragment key={index}>
          {token.type === 'bold' ? (
            <strong className="font-semibold">{token.value}</strong>
          ) : token.type === 'italic' ? (
            <em>{token.value}</em>
          ) : token.type === 'code' ? (
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              {token.value}
            </code>
          ) : (
            token.value
          )}
        </Fragment>
      ))}
    </>
  );
}

export function AiText({ text, className }: { text: string; className?: string }) {
  const blocks = parseAiText(text);

  return (
    <div className={cn('space-y-2.5', className)}>
      {blocks.map((block, index) =>
        block.type === 'list' ? (
          <ul key={index} className="space-y-1.5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex gap-2.5">
                <span
                  className="mt-[0.55em] size-1 shrink-0 rounded-full bg-current opacity-50"
                  aria-hidden
                />
                <span className="min-w-0">
                  <Inline tokens={item} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="text-pretty">
            <Inline tokens={block.content} />
          </p>
        ),
      )}
    </div>
  );
}
