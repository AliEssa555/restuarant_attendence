import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class merge, as used by every component below. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
