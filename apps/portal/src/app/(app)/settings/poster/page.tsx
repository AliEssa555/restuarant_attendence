'use client';

import * as React from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/spinner';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { getMarkerPayload, rotateMarker } from '@/lib/callables';
import { callableErrorMessage } from '@/lib/reason-codes';

/**
 * The printable check-in poster.
 *
 * The QR payload is `ATTN1|{rid}|{version}|{secret}` and is only ever fetched
 * through the `getMarkerPayload` callable — the secret is unreadable through
 * Firestore, so printing the poster is the single way it leaves the server.
 * Anyone who can see this page can photograph the code, which is exactly what
 * "Rotate code" is for.
 */
export default function PosterPage() {
  const { isOwner } = useAuth();
  const toast = useToast();
  const [payload, setPayload] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState<number | null>(null);
  const [restaurantName, setRestaurantName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const result = await getMarkerPayload({});
      setPayload(result.payload);
      setVersion(result.markerVersion);
      setRestaurantName(result.restaurantName);
      setError(null);
    } catch (err) {
      setError(callableErrorMessage(err));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function rotate() {
    setRotating(true);
    try {
      const result = await rotateMarker({});
      setPayload(result.payload);
      setVersion(result.markerVersion);
      setConfirmRotate(false);
      toast.success(
        'New code generated',
        'Every previously printed poster has stopped working. Print and put up the new one now.',
      );
    } catch (err) {
      toast.error('Could not rotate the code', callableErrorMessage(err));
    } finally {
      setRotating(false);
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Check-in poster" />
        <p className="text-sm text-destructive">{error}</p>
      </>
    );
  }

  if (!payload) return <Spinner label="Loading poster..." full />;

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Check-in poster"
          description={`Code version ${version}. Print this and put it on the wall where staff check in.`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/settings">
                  <ArrowLeft className="h-4 w-4" />
                  Settings
                </Link>
              </Button>
              {isOwner && (
                <Button variant="outline" onClick={() => setConfirmRotate(true)}>
                  <RefreshCw className="h-4 w-4" />
                  Rotate code
                </Button>
              )}
              <Button onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          }
        />

        <Card className="mb-6 max-w-3xl">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Where to put it</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              <li>
                On a wall near the entrance or the staff area, at about shoulder
                height.
              </li>
              <li>
                Somewhere well lit, and not behind a glare from a window or a
                lamp.
              </li>
              <li>
                Staff stand roughly 50–80 cm in front of it, facing the camera,
                with the poster visible behind them.
              </li>
              <li>
                Keep it inside the restaurant. Anyone who can photograph the code
                could use it elsewhere — rotate it if that happens.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Poster payload={payload} restaurantName={restaurantName} version={version} />

      <Dialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate the check-in code?</DialogTitle>
            <DialogDescription>
              Every poster already printed stops working immediately, and face
              check-in will fail with &ldquo;wrong or expired poster&rdquo; until
              you print and put up the new one. Do this if the code has been
              photographed or shared.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRotate(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={rotate} disabled={rotating}>
              {rotating ? 'Rotating...' : 'Rotate code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The printed page itself.
 *
 * Sized and laid out for A4 (see the `@media print` block in `globals.css`).
 * The QR is rendered as an SVG so it stays crisp at any print resolution — a
 * rasterised code at 96dpi is exactly the kind of thing that decodes on screen
 * and then fails on the wall.
 */
function Poster({
  payload,
  restaurantName,
  version,
}: {
  payload: string;
  restaurantName: string;
  version: number | null;
}) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border bg-white p-10 text-black print:max-w-none print:rounded-none print:border-0 print:p-0">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Staff check-in
        </p>
        <h2 className="mt-2 text-4xl font-bold leading-tight">{restaurantName}</h2>
      </div>

      <div className="my-10 flex justify-center">
        <div className="rounded-xl border-4 border-black p-5">
          {/*
            `level="M"` balances size against damage tolerance: a poster on a
            restaurant wall picks up grease and scuffs, and M recovers ~15% of
            the code.
          */}
          <QRCodeSVG
            value={payload}
            size={360}
            level="M"
            marginSize={2}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
      </div>

      <ol className="mx-auto flex max-w-md flex-col gap-3 text-lg">
        <Step n={1}>Open the Attendance app and tap “Check in with face”.</Step>
        <Step n={2}>
          Stand in front of this poster so the square code is visible behind you.
        </Step>
        <Step n={3}>Look at the camera and take the photo.</Step>
      </ol>

      <p className="mt-10 text-center text-sm text-neutral-500">
        Code version {version} · Do not remove or photograph this poster
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-base font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
