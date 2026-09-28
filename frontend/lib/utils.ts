import { createCn } from 'cn/config';

/**
 * `cn` with the project's typography scale registered as font-size utilities.
 *
 * Without this, the merge engine cannot tell `.text-caption` from a text
 * *colour*: any `cn('text-caption …', 'text-muted-foreground')` silently drops
 * the size and the line renders at the inherited 16px — which is exactly what
 * happened to form hints. Registering the scale puts size and colour in
 * different conflict groups, so they compose instead of fighting.
 *
 * Keep in step with the `.text-*` utilities in `app/globals.css`.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'h4',
            'body',
            'body-lg',
            'small',
            'caption',
            'label',
            'nav',
            'price',
            'price-lg',
          ],
        },
      ],
    },
  },
});
