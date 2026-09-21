import { cn } from '@/lib/utils';

type ContainerWidth = 'default' | 'wide' | 'narrow';

const widths: Record<ContainerWidth, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-(--container-page)',
  wide: 'max-w-[96rem]',
};

interface ContainerProps extends React.ComponentProps<'div'> {
  width?: ContainerWidth;
}

/** The single horizontal gutter for the whole site. Never re-specify padding. */
export function Container({ className, width = 'default', ...props }: ContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', widths[width], className)}
      {...props}
    />
  );
}
