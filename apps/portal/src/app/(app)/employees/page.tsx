'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, UserPlus } from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { FaceStatusBadge, PresenceBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { setEmployeeActive } from '@/lib/callables';
import { callableErrorMessage } from '@/lib/reason-codes';
import { useEmployees } from '@/lib/hooks';
import type { Employee } from '@/lib/types';

export default function EmployeesPage() {
  const { data, loading, error } = useEmployees();
  const [search, setSearch] = React.useState('');

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((e) =>
      [e.name, e.email, e.position].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
    );
  }, [data, search]);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Add staff, set their shift start, and manage face enrolment."
        action={
          <Button asChild>
            <Link href="/employees/new">
              <Plus className="h-4 w-4" />
              Add employee
            </Link>
          </Button>
        }
      />

      {data.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Input
            placeholder="Search name, email or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col gap-2 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : data.length === 0 ? (
            <div className="p-10 text-center">
              <UserPlus className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No employees yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adding an employee creates their login and shows a temporary
                password once.
              </p>
              <Button asChild className="mt-4">
                <Link href="/employees/new">Add employee</Link>
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No employees match “{search}”.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Role</TableHead>
                  <TableHead>Now</TableHead>
                  <TableHead className="hidden md:table-cell">Face</TableHead>
                  <TableHead className="hidden lg:table-cell">Shift start</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((employee) => (
                  <EmployeeRow key={employee.id} employee={employee} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function EmployeeRow({ employee }: { employee: Employee }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function toggle(active: boolean) {
    setBusy(true);
    try {
      await setEmployeeActive({ employeeId: employee.id, active });
      toast.success(
        active ? `${employee.name} re-activated` : `${employee.name} deactivated`,
        active
          ? 'They can sign in and check in again.'
          : 'Their login is disabled and any open session is revoked.',
      );
    } catch (err) {
      toast.error('Could not change that', callableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow className={employee.active ? undefined : 'opacity-60'}>
      <TableCell>
        <Link
          href={`/employees/${employee.id}`}
          className="font-medium hover:underline"
        >
          {employee.name}
        </Link>
        <p className="text-xs text-muted-foreground">{employee.email}</p>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {employee.position || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <PresenceBadge status={employee.presence?.status === 'in' ? 'in' : 'out'} />
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <FaceStatusBadge status={employee.face?.status ?? 'none'} />
      </TableCell>
      <TableCell className="hidden lg:table-cell tabular-nums">
        {employee.scheduledStart || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right">
        <Switch
          checked={employee.active}
          disabled={busy}
          onCheckedChange={toggle}
          aria-label={`${employee.active ? 'Deactivate' : 'Activate'} ${employee.name}`}
        />
      </TableCell>
    </TableRow>
  );
}
