'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps {
  /** Wired to an external `<label htmlFor>` when there is one. */
  id?: string;
  /** `''` means nothing chosen — the placeholder shows instead. */
  value: string;
  onValueChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  /** Adds a row that clears the choice. Its label is usually "All". */
  clearLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'default' | 'lg';
  /** `true` stretches the trigger; the default sizes it to its content. */
  fullWidth?: boolean;
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * The one dropdown in ZyCart that takes a plain list of options.
 *
 * It exists because four places had each hand-rolled the same native
 * `<select>` with the same four utility classes — and a native select cannot
 * be styled past its border in Safari or on Windows, so those four were the
 * only controls in the product that still looked like the operating system
 * rather than like ZyCart. This wraps the design-system `Select`, so the
 * option list, the check mark, the hover and the dark theme are the same ones
 * the sort control on the shop page uses.
 *
 * Base UI keeps the native control's keyboard contract (type-ahead, arrows,
 * Home/End, Enter and Escape) and renders a real listbox for screen readers,
 * so nothing is given up in the trade.
 */
export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  clearLabel,
  disabled = false,
  size = 'default',
  fullWidth = true,
  name,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: SelectFieldProps) {
  /**
   * Base UI models "nothing selected" as `null`; the callers here all model it
   * as the empty string, because that is what a form field and a URL search
   * param both want. The translation happens once, here.
   */
  const items = [
    ...(clearLabel ? [{ value: '', label: clearLabel }] : []),
    ...options.map((option) => ({ value: option.value, label: option.label })),
  ];

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(typeof next === 'string' ? next : '')}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={cn(fullWidth && 'w-full', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent>
        {clearLabel && (
          <SelectItem value="" className="text-muted-foreground">
            {clearLabel}
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
