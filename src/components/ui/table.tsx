'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// On phones, rows render as stacked cards (see .table-stack in globals.css). Cells get
// their column title as data-label so each value keeps its meaning without a header row.
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  const ref = React.useRef<HTMLTableElement>(null);

  React.useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const label = () => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => cell.textContent?.trim() ?? '');
      table.querySelectorAll('tbody tr').forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          const text = headers[index] ?? '';
          if (cell.getAttribute('data-label') !== text) cell.setAttribute('data-label', text);
        });
      });
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('table-stack w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return <tfoot className={cn('border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-muted/40', className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('h-10 px-3 text-start align-middle text-xs font-semibold text-muted-foreground', className)} {...props} />;
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return <caption className={cn('mt-3 text-sm text-muted-foreground', className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
