import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCredits, formatDateTime, formatSignedCredits } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LedgerEntry } from '@/types/api';

/**
 * The ledger, newest first.
 *
 * Amounts are signed exactly as stored, and balanceAfter is shown next to them:
 * a reader can add the column up and land on the balance, which is the whole
 * point of the ledger being the source of truth.
 *
 * A table is unreadable on a phone, so below the small breakpoint the same rows
 * render as cards. Same data, no horizontal scrolling.
 */
export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Balance after</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                  {formatDateTime(entry.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {entry.currency?.name ?? '—'}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-2">
                    <EntryBadge entry={entry} />
                    <span className="text-muted-foreground truncate">{entry.description}</span>
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    'tabular text-right font-medium',
                    entry.amount < 0 ? 'text-foreground' : 'text-primary',
                  )}
                >
                  {formatSignedCredits(entry.amount)}
                </TableCell>
                <TableCell className="tabular text-muted-foreground text-right">
                  {formatCredits(entry.balanceAfter)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <EntryBadge entry={entry} />
                <p className="truncate text-sm">{entry.description}</p>
                <p className="text-muted-foreground text-xs">
                  {entry.currency?.name} · {formatDateTime(entry.createdAt)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    'tabular font-semibold',
                    entry.amount < 0 ? 'text-foreground' : 'text-primary',
                  )}
                >
                  {formatSignedCredits(entry.amount)}
                </p>
                <p className="tabular text-muted-foreground text-xs">
                  → {formatCredits(entry.balanceAfter)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function EntryBadge({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.amount > 0;

  return (
    <Badge variant={isCredit ? 'default' : 'secondary'} className="gap-1">
      {isCredit ? (
        <ArrowDownLeft className="size-3" aria-hidden />
      ) : (
        <ArrowUpRight className="size-3" aria-hidden />
      )}
      {isCredit ? 'Purchase' : 'Campaign funding'}
    </Badge>
  );
}
