'use client';

import * as React from 'react';
import {
  collection,
  doc,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';

import { useAuth } from './auth-context';
import { firebaseStorage, firestore } from './firebase';
import type { AttendanceRecord, Employee } from './types';

export interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Live employee list for the signed-in restaurant.
 *
 * `onSnapshot` rather than a one-off read throughout the portal: the dashboard
 * is meant to be left open on a counter, showing who is in right now.
 */
export function useEmployees(): Loadable<Employee[]> {
  const { claims } = useAuth();
  const rid = claims.restaurantId;
  const [state, setState] = React.useState<Loadable<Employee[]>>({
    data: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    if (!rid) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    return onSnapshot(
      query(collection(firestore(), 'restaurants', rid, 'employees'), orderBy('name')),
      (snap) => {
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Employee),
          loading: false,
          error: null,
        });
      },
      (err) => setState({ data: [], loading: false, error: err.message }),
    );
  }, [rid]);

  return state;
}

export function useEmployee(employeeId: string | null): Loadable<Employee | null> {
  const { claims } = useAuth();
  const rid = claims.restaurantId;
  const [state, setState] = React.useState<Loadable<Employee | null>>({
    data: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    if (!rid || !employeeId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    return onSnapshot(
      doc(firestore(), 'restaurants', rid, 'employees', employeeId),
      (snap) => {
        setState({
          data: snap.exists() ? ({ id: snap.id, ...snap.data() } as Employee) : null,
          loading: false,
          error: null,
        });
      },
      (err) => setState({ data: null, loading: false, error: err.message }),
    );
  }, [rid, employeeId]);

  return state;
}

export interface AttendanceQuery {
  localDate?: string;
  fromDate?: string;
  toDate?: string;
  employeeId?: string;
  status?: string;
  limit?: number;
  /** Skip the subscription entirely (e.g. while filters are incomplete). */
  enabled?: boolean;
}

/**
 * Live attendance records.
 *
 * Only filters backed by the composite indexes in `firestore.indexes.json` are
 * pushed to Firestore; `method` is filtered in memory by the caller, which
 * avoids needing an index per filter combination.
 */
export function useAttendance(options: AttendanceQuery): Loadable<AttendanceRecord[]> {
  const { claims } = useAuth();
  const rid = claims.restaurantId;
  const {
    localDate,
    fromDate,
    toDate,
    employeeId,
    status,
    limit = 200,
    enabled = true,
  } = options;

  const [state, setState] = React.useState<Loadable<AttendanceRecord[]>>({
    data: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    if (!rid || !enabled) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    const constraints: QueryConstraint[] = [];
    if (employeeId) constraints.push(where('employeeId', '==', employeeId));
    if (localDate) {
      constraints.push(where('localDate', '==', localDate));
    } else {
      if (fromDate) constraints.push(where('localDate', '>=', fromDate));
      if (toDate) constraints.push(where('localDate', '<=', toDate));
    }
    if (status) constraints.push(where('status', '==', status));
    constraints.push(orderBy('createdAt', 'desc'), fbLimit(limit));

    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      query(collection(firestore(), 'restaurants', rid, 'attendance'), ...constraints),
      (snap) => {
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AttendanceRecord),
          loading: false,
          error: null,
        });
      },
      (err) => setState({ data: [], loading: false, error: err.message }),
    );
  }, [rid, localDate, fromDate, toDate, employeeId, status, limit, enabled]);

  return state;
}

/**
 * Resolve a Storage path to a download URL.
 *
 * Returns null while loading or if the object is missing — a review screen
 * should say "photo unavailable", not break.
 */
export function useStorageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let active = true;
    getDownloadURL(ref(firebaseStorage(), path))
      .then((resolved) => {
        if (active) setUrl(resolved);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [path]);

  return url;
}
