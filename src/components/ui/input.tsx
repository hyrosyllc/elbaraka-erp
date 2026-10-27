import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        type === 'checkbox'
          ? 'size-[15px] accent-primary'
          : 'h-9 w-full min-w-0 rounded-[5px] border border-input bg-background px-2.5 text-label font-medium text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
