'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn('fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in', className)}
      {...props}
    />
  );
}

// On phones the dialog becomes a bottom sheet: it slides up, shows a grab handle and
// can be dismissed by dragging the handle down.
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const drag = React.useRef<{ startY: number; dy: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startY: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (contentRef.current) contentRef.current.style.transition = 'none';
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !contentRef.current) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY);
    contentRef.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerEnd = () => {
    const node = contentRef.current;
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    if (!node) return;
    if (dy > 110) {
      closeRef.current?.click();
      return;
    }
    node.style.transition = 'transform 180ms ease-out';
    node.style.transform = '';
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        className={cn(
          'fixed left-1/2 top-1/2 z-[101] grid max-h-[min(90vh,850px)] w-[calc(100%-32px)] max-w-[590px] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-y-auto overscroll-contain rounded-[10px] border border-border bg-card text-foreground shadow-popover outline-none',
          'max-[760px]:inset-x-0 max-[760px]:bottom-0 max-[760px]:left-0 max-[760px]:top-auto max-[760px]:max-h-[92dvh] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:translate-x-0 max-[760px]:translate-y-0 max-[760px]:rounded-b-none max-[760px]:rounded-t-[22px] max-[760px]:border-x-0 max-[760px]:border-b-0 max-[760px]:pb-[env(safe-area-inset-bottom)]',
          'max-[760px]:data-[state=closed]:animate-sheet-out max-[760px]:data-[state=open]:animate-sheet-in',
          className,
        )}
        {...props}
      >
        <div
          className="sticky top-0 z-10 hidden h-6 shrink-0 cursor-grab touch-none items-center justify-center bg-card max-[760px]:flex"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          aria-hidden="true"
        >
          <span className="h-1.5 w-11 rounded-full bg-border" />
        </div>
        {children}
        <DialogPrimitive.Close ref={closeRef} className={cn('absolute end-3 top-3 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-[760px]:top-5', !showCloseButton && 'sr-only')}>
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 border-b border-border px-5 py-4 text-start', className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-base font-semibold leading-none tracking-tight', className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid gap-4 px-5 py-5', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-4 max-[760px]:sticky max-[760px]:bottom-0 max-[760px]:[&>button]:min-h-11 min-[761px]:flex-row min-[761px]:justify-end', className)} {...props} />;
}

export {
  Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger,
};
