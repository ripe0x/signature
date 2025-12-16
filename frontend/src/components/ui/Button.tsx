'use client';

import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-mono transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Variants
          variant === 'default' &&
            'bg-foreground text-background hover:bg-foreground/90',
          variant === 'outline' &&
            'border border-border hover:border-foreground bg-transparent',
          variant === 'ghost' &&
            'hover:bg-foreground/5 bg-transparent',
          // Sizes
          size === 'sm' && 'text-xs px-3 py-1.5',
          size === 'md' && 'text-sm px-4 py-2',
          size === 'lg' && 'text-base px-6 py-3',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
