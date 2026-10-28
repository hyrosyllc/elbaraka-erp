import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-saffron/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-gradient text-primary-foreground hover:brightness-110',
        primary: 'bg-brand-gradient text-primary-foreground hover:brightness-110',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border-input bg-background text-foreground hover:bg-muted',
        secondary: 'border-input bg-card text-muted-foreground hover:bg-surface',
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        link: 'h-auto border-0 bg-transparent p-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-3.5 py-2 max-[760px]:min-h-11',
        sm: 'min-h-8 rounded px-2.5 max-[760px]:min-h-10',
        lg: 'min-h-11 rounded-md px-6',
        icon: 'size-9 p-0 max-[760px]:size-10',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
