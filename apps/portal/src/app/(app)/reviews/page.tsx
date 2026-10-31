'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCheck } from 'lucide-react';

import { PageHeader } from '@/components/app-shell';
import { AttendanceDetailDialog } from '@/components/attendance-detail';
import { EnrolmentPhoto, EnrolmentReviewCard } from '@/components/enrolment-review-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTimezone } from '@/lib/auth-context';
import { dateTimeIn, similarityLabel, toDate } from '@/lib/format';
import { useAttendance, useEmployee, useEmployees, useStorageUrl } from '@/lib/hooks';
import type { AttendanceRecord } from '@/lib/types';

/**
 * Everything waiting on a human decision, in one place.
 *
 * Two queues with very different stakes: approving an enrolment decides who a
 * stored face belongs to from now on, while approving a flagged check-in only
 * decides one shift's record. The enrolment tab is first for that reason.
 */
export default function ReviewsPage() {
  const employees = useEmployees();
  const pending = useAttendance({ status: 'pending_review', limit: 200 });
  const [selected, setSelected] = React.useState<AttendanceRecord | null>(null);

  const pendingEnrolments = employees.data.filter(
    (e) => e.face?.status === 'pending',
  );

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Face enrolments and flagged check-ins waiting on you."
      />

      <Tabs defaultValue="enrolments">
        <TabsList>
          <TabsTrigger value="enrolments">
            Enrolments
            {pendingEnrolments.length > 0 && (
              <Badge variant="warning">{pendingEnrolments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="checkins">
            Check-ins
            {pending.data.length > 0 && (
              <Badge variant="warning">{pending.data.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enrolments">
          {employees.loading ? (
            <Skeleton className="h-40 w-full max-w-xl" />
          ) : pendingEnrolments.length === 0 ? (
            <AllClear
              title="No enrolments waiting"
              body="When an employee submits their face photos, they appear here for approval."
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {pendingEnrolments.map((employee) => (
                <EnrolmentReviewCard key={employee.id} employee={employee} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="checkins">
          {pending.loading ? (
            <Skeleton className="h-40 w-full max-w-xl" />
          ) : pending.error ? (
            <p className="text-sm text-destructive">{pending.error}</p>
          ) : pending.data.length === 0 ? (
            <AllClear
              title="No check-ins waiting"
              body="Check-ins that score between the review and verify thresholds land here."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pending.data.map((record) => (
                <PendingCheckinCard
                  key={record.id}
                  record={record}
                  onOpen={() => setSelected(record)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AttendanceDetailDialog record={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/**
 * Side-by-side enrolment and check-in photo — the comparison a manager actually
 * makes. The score is shown too, but the photos are what decides it.
 */
function PendingCheckinCard({
  record,
  onOpen,
}: {
  record: AttendanceRecord;
  onOpen: () => void;
}) {
  const tz = useTimezone();
  const { data: employee } = useEmployee(record.employeeId);
  const checkinUrl = useStorageUrl(record.face?.photoPath);
  const enrolUrl = useStorageUrl(employee?.face?.enrolPhotoPath);

  return (
    <Card className="border-warning/40">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/employees/${record.employeeId}`}
              className="font-medium hover:underline"
            >
              {record.employeeName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {record.type === 'check_in' ? 'Check in' : 'Check out'} ·{' '}
              {dateTimeIn(tz, toDate(record.createdAt))}
            </p>
          </div>
          <Badge variant="warning">
            Match {similarityLabel(record.face?.similarity)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Enrolled
            </p>
            <EnrolmentPhoto url={enrolUrl} className="h-40 w-full" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              This check-in
            </p>
            <EnrolmentPhoto url={checkinUrl} className="h-40 w-full" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Poster{' '}
            {record.face?.markerValid ? (
              <span className="font-medium text-success">verified</span>
            ) : (
              <span className="font-medium text-destructive">not verified</span>
            )}
          </span>
          <span>·</span>
          <span>{record.face?.facesDetected ?? 0} face(s)</span>
        </div>

        <Button onClick={onOpen} className="mt-3 w-full">
          Review
        </Button>
      </CardContent>
    </Card>
  );
}

function AllClear({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <CheckCheck className="mx-auto h-8 w-8 text-success" />
        <p className="mt-3 font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
