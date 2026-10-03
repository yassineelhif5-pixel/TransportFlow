import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Loader2, Search, X } from 'lucide-react';

// ------------------------------------------------------------------ Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-600 active:bg-brand-600 shadow-[0_1px_0_rgba(255,255,255,.15)_inset,0_6px_16px_-8px_rgba(35,110,190,.8)]',
  secondary: 'bg-surface text-ink border border-line hover:border-subtle/70 hover:bg-raised',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'bg-stop text-white hover:brightness-110',
  success: 'bg-go text-white hover:brightness-110',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.8125rem] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-[0.9375rem] gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,border,color,filter,box-shadow] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('inline-grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Champs

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, error, hint, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="field-label">
          {label}
          {required && <span className="ml-0.5 text-stop" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-stop" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string; leading?: ReactNode; trailing?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leading, trailing, className, id, required, ...rest }, ref,
) {
  const inputId = id ?? (label ? `f-${label.replace(/\W+/g, '-').toLowerCase()}` : undefined);
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={inputId} className={className}>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={clsx('field-input', leading && 'pl-9', trailing && 'pr-10')}
          {...rest}
        />
        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; hint?: string; placeholder?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className, id, children, placeholder, required, ...rest }, ref,
) {
  const selectId = id ?? (label ? `s-${label.replace(/\W+/g, '-').toLowerCase()}` : undefined);
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={selectId} className={className}>
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className="field-input appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238FA3BA' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {children}
      </select>
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, required, ...rest }, ref,
) {
  const areaId = id ?? (label ? `t-${label.replace(/\W+/g, '-').toLowerCase()}` : undefined);
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={areaId} className={className}>
      <textarea
        ref={ref}
        id={areaId}
        required={required}
        aria-invalid={error ? true : undefined}
        className="field-input h-auto min-h-[88px] resize-y py-2.5 leading-relaxed"
        {...rest}
      />
    </Field>
  );
});

/** Sélecteur de date / date-heure natif, stylé et accessible. */
export const DatePicker = forwardRef<HTMLInputElement, InputProps & { withTime?: boolean }>(function DatePicker({ withTime, ...rest }, ref) {
  return <Input ref={ref} type={withTime ? 'datetime-local' : 'date'} {...rest} />;
});

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Rechercher'}
        className="field-input pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Effacer la recherche" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-subtle hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, id }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-line bg-surface accent-[#236EBE]"
      />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 text-sm text-ink"
    >
      <span className={clsx('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-go' : 'bg-line')}>
        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
      {label}
    </button>
  );
}
