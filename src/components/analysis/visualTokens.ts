export const dsSpacing = {
  1: 'gap-1', // 4px
  2: 'gap-2', // 8px
  3: 'gap-3', // 12px
  4: 'gap-4', // 16px
  6: 'gap-6', // 24px
  8: 'gap-8', // 32px
  p1: 'p-1',
  p2: 'p-2',
  p3: 'p-3',
  p4: 'p-4',
  p6: 'p-6',
  p8: 'p-8',
} as const;

export const dsRadius = {
  sm: 'rounded-[var(--radius-sm)]',
  md: 'rounded-[var(--radius-md)]',
  lg: 'rounded-[var(--radius-lg)]',
} as const;

export const dsShadow = {
  sm: 'shadow-[var(--shadow-sm)]',
  md: 'shadow-[var(--shadow-md)]',
  lg: 'shadow-[var(--shadow-lg)]',
} as const;

export const semanticColors = {
  bg: 'bg-[var(--color-bg)]',
  surface: 'bg-[var(--color-surface)]',
  textPrimary: 'text-[var(--color-text-primary)]',
  textSecondary: 'text-[var(--color-text-secondary)]',
  success: 'text-[var(--color-success-700)]',
  warning: 'text-[var(--color-warning-700)]',
  danger: 'text-[var(--color-danger-700)]',
} as const;

export const analysisCardTokens = {
  base: `${dsRadius.lg} border border-[var(--color-border)] ${semanticColors.surface} ${dsShadow.sm}`,
  elevated: `${dsRadius.lg} border border-[var(--color-border)] ${semanticColors.surface} ${dsShadow.md}`,
  subtle: `${dsRadius.md} border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]`,
} as const;

export const analysisStateTokens = {
  success: 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-200)]',
  warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-200)]',
  danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger-700)] border-[var(--color-danger-200)]',
} as const;
