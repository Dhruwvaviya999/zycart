import type { AiComparison, AiProductResult } from '@/types/ai';

/**
 * The comparison table.
 *
 * A blank cell is rendered as an em dash with a spoken explanation, because
 * "the catalogue does not list this" and "this product does not have it" are
 * different claims and the table must not make the stronger one. The rows
 * themselves are built on the server from documented fields only — nothing here
 * can add a row the catalogue does not support.
 *
 * It scrolls horizontally rather than wrapping: at 360px a four-column table
 * has to go somewhere, and a scrollable table is readable where a squeezed one
 * is not.
 */
interface AiComparisonTableProps {
  comparison: AiComparison;
  products: AiProductResult[];
}

export function AiComparisonTable({ comparison, products }: AiComparisonTableProps) {
  const columns = comparison.productIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is AiProductResult => Boolean(product));

  if (columns.length < 2 || comparison.rows.length === 0) return null;

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border">
      <table className="w-full min-w-[22rem] border-collapse text-left">
        <caption className="sr-only">
          Comparison of {columns.map((product) => product.name).join(' and ')}
        </caption>

        <thead>
          <tr className="border-b border-border bg-surface">
            <th scope="col" className="text-caption px-3 py-2.5 font-medium text-muted-foreground">
              <span className="sr-only">Attribute</span>
            </th>
            {columns.map((product) => (
              <th
                key={product.id}
                scope="col"
                className="text-caption min-w-[7.5rem] px-3 py-2.5 leading-snug font-semibold"
              >
                {product.name}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.label} className="border-b border-border/70 last:border-b-0">
              <th
                scope="row"
                className="text-caption px-3 py-2.5 font-medium whitespace-nowrap text-muted-foreground"
              >
                {row.label}
              </th>

              {columns.map((product, index) => {
                const value = row.values[index] ?? null;

                return (
                  <td key={product.id} className="text-caption px-3 py-2.5">
                    {value ?? (
                      <>
                        <span aria-hidden className="text-muted-foreground">
                          —
                        </span>
                        <span className="sr-only">Not listed</span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
