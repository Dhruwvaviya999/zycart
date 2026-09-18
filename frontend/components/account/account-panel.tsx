/** One heading treatment for every account section, so the pages stay siblings. */
export function AccountPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-h3">{title}</h2>
          <p className="text-small mt-1.5 text-pretty text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>

      <div className="mt-7">{children}</div>
    </section>
  );
}
