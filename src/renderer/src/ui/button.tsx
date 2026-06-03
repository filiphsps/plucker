import React from 'react'

/**
 * The app's single reusable button. Two variants matching the existing
 * Settings / tag-edit buttons:
 *  - default: bordered raise surface, dim ink that brightens on hover
 *  - primary: flat accent fill, white label
 * Pass-through for all native <button> props; extra `className` is appended.
 */
export function Button({
  variant = 'default',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary'
  className?: string
}): React.JSX.Element {
  const base =
    'inline-flex h-[30px] items-center gap-1.5 rounded-md px-3.5 text-[12.5px] font-medium transition-colors disabled:cursor-default disabled:opacity-50'
  const variantCls =
    variant === 'primary'
      ? 'bg-accent font-semibold text-white hover:brightness-110'
      : 'border border-line bg-raise text-ink-dim hover:text-ink'
  return <button className={`${base} ${variantCls} ${className}`.trim()} {...props} />
}
