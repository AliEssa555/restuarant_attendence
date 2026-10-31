'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, KeyRound } from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEmployee } from '@/lib/callables';
import { callableErrorMessage } from '@/lib/reason-codes';

interface Created {
  employeeId: string;
  email: string;
  tempPassword: string;
  name: string;
}

/**
 * Add an employee.
 *
 * The temporary password is shown **once** and never stored anywhere — the
 * server generates it, hands it back, and forgets it. If the manager loses it
 * the employee has to use "forgot password", which is the right trade: a
 * password a portal can re-display is a password sitting in a database.
 */
export default function NewEmployeePage() {
  const [created, setCreated] = React.useState<Created | null>(null);

  return (
    <>
      <PageHeader
        title={created ? 'Employee created' : 'Add employee'}
        description={
          created
            ? 'Give them this password now — it cannot be shown again.'
            : 'This creates their login straight away.'
        }
        action={
          <Button variant="outline" asChild>
            <Link href="/employees">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <div className="max-w-xl">
        {created ? (
          <CredentialsPanel created={created} onAddAnother={() => setCreated(null)} />
        ) : (
          <NewEmployeeForm onCreated={setCreated} />
        )}
      </div>
    </>
  );
}

function NewEmployeeForm({ onCreated }: { onCreated: (created: Created) => void }) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [position, setPosition] = React.useState('');
  const [scheduledStart, setScheduledStart] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createEmployee({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        // Empty strings would fail the server's `.max()`/format checks, so the
        // optional fields are omitted rather than sent blank.
        phone: phone.trim() || undefined,
        position: position.trim() || undefined,
        scheduledStart: scheduledStart || undefined,
      });
      onCreated({
        employeeId: result.employeeId,
        email: result.email,
        tempPassword: result.tempPassword,
        name: name.trim(),
      });
    } catch (err) {
      setError(callableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is their login. It does not need to be a real inbox for the
              demo, but password reset will not work without one.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="position">Role</Label>
              <Input
                id="position"
                placeholder="Waiter, Chef, ..."
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start">Scheduled start</Label>
            <Input
              id="start"
              type="time"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="max-w-[9rem]"
            />
            <p className="text-xs text-muted-foreground">
              Used for the late flag, in the restaurant&apos;s timezone. Leave
              empty and they are never marked late.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? 'Creating...' : 'Create employee'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CredentialsPanel({
  created,
  onAddAnother,
}: {
  created: Created;
  onAddAnother: () => void;
}) {
  return (
    <Card className="border-warning/40">
      <CardContent className="pt-5">
        <div className="mb-4 flex gap-2 rounded-md bg-warning/10 p-3 text-sm">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Write this down or copy it now. It is not stored and cannot be shown
            again. {created.name} will be asked to change it on first sign-in.
          </span>
        </div>

        <dl className="flex flex-col gap-3">
          <CopyField label="Email" value={created.email} />
          <CopyField label="Temporary password" value={created.tempPassword} mono />
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onAddAnother}>
            Add another
          </Button>
          <Button asChild>
            <Link href={`/employees/${created.employeeId}`}>
              Open {created.name.split(' ')[0]}&apos;s profile
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). The
      // value is on screen either way, so this only loses the convenience.
      setCopied(false);
    }
  }

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-2">
        <code
          className={
            mono
              ? 'flex-1 select-all rounded-md bg-muted px-3 py-2 font-mono text-base tracking-wider'
              : 'flex-1 select-all rounded-md bg-muted px-3 py-2 text-sm'
          }
        >
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </dd>
    </div>
  );
}
