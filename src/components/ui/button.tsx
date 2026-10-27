import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#d99b2b]/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        primary: 'bg-primary text-primary-foreground hover:bg-[#124b38]',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border-input bg-background text-foreground hover:bg-muted',
        secondary: 'border-[#d4ddd5] bg-white text-[#4f6058] hover:bg-[#f7f9f7]',
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        link: 'h-auto border-0 bg-transparent p-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-3.5 py-2',
        sm: 'min-h-8 rounded px-2.5',
        lg: 'min-h-11 rounded-md px-6',
        icon: 'size-9 p-0',
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
