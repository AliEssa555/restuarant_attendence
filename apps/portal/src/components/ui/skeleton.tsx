import { cn } from '@/lib/utils';

/** Placeholder block for the moment before a Firestore snapshot arrives. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
  );
}
