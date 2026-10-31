import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Spinner({
  label,
  full = false,
  className,
}: {
  label?: string;
  /** Centre it in the viewport, for whole-page loading states. */
  full?: boolean;
  className?: string;
}) {
  const content = (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
      {label && <span>{label}</span>}
    </div>
  );

  if (!full) return content;
  return (
    <div className="flex min-h-dvh items-center justify-center">{content}</div>
  );
}
