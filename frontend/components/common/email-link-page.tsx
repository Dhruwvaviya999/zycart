import { Container } from '@/components/layout/container';

/**
 * The frame around a page reached from a link in an email.
 *
 * Deliberately plain: somebody arriving from their inbox wants to know that
 * the thing they clicked worked, and a full storefront page around one
 * sentence would bury it. The storefront's navbar and footer still surround
 * it, so it is unmistakably ZyCart.
 */
export function EmailLinkPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Container width="narrow" className="py-14 sm:py-20">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-h2">{title}</h1>
        <p className="text-small mt-2.5 text-pretty text-muted-foreground">{description}</p>
      </div>

      <div className="mx-auto mt-8 max-w-md">{children}</div>
    </Container>
  );
}

/** A query parameter as one string, or empty. The pages never trust its shape. */
export function oneParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
