'use client';

import * as React from 'react';
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

import { firebaseAuth, firestore } from './firebase';
import type { Restaurant, Role } from './types';

export interface Claims {
  role: Role | null;
  restaurantId: string | null;
}

interface AuthState {
  /** Still resolving auth, claims or the restaurant document. */
  loading: boolean;
  user: User | null;
  claims: Claims;
  restaurant: Restaurant | null;
  /** Owner or manager of a restaurant — i.e. allowed in this portal at all. */
  isStaff: boolean;
  isOwner: boolean;
  signOut: () => Promise<void>;
  /** Re-read claims after a callable changes them (e.g. createRestaurant). */
  refreshClaims: () => Promise<Claims>;
}

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [claims, setClaims] = React.useState<Claims>({
    role: null,
    restaurantId: null,
  });
  const [restaurant, setRestaurant] = React.useState<Restaurant | null>(null);
  const [authResolved, setAuthResolved] = React.useState(false);
  const [claimsResolved, setClaimsResolved] = React.useState(false);

  const readClaims = React.useCallback(
    async (current: User | null, forceRefresh = false): Promise<Claims> => {
      if (!current) return { role: null, restaurantId: null };
      const token = await current.getIdTokenResult(forceRefresh);
      return {
        role: (token.claims.role as Role) ?? null,
        restaurantId: (token.claims.rid as string) ?? null,
      };
    },
    [],
  );

  React.useEffect(() => {
    const auth = firebaseAuth();

    const unsubAuth = onAuthStateChanged(auth, async (current) => {
      setUser(current);
      setAuthResolved(true);
      setClaimsResolved(false);
      // Force a refresh: a brand-new owner's claims are set by
      // `createRestaurant` after the account already exists, so the token
      // minted at sign-up has no `rid` in it.
      setClaims(await readClaims(current, true));
      setClaimsResolved(true);
    });

    // Keeps the role in sync if an admin changes claims mid-session.
    const unsubToken = onIdTokenChanged(auth, async (current) => {
      if (!current) return;
      setClaims(await readClaims(current));
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, [readClaims]);

  React.useEffect(() => {
    if (!claims.restaurantId) {
      setRestaurant(null);
      return;
    }
    return onSnapshot(
      doc(firestore(), 'restaurants', claims.restaurantId),
      (snap) => {
        setRestaurant(
          snap.exists()
            ? ({ id: snap.id, ...snap.data() } as Restaurant)
            : null,
        );
      },
      () => setRestaurant(null),
    );
  }, [claims.restaurantId]);

  const value = React.useMemo<AuthState>(() => {
    const isStaff =
      (claims.role === 'owner' || claims.role === 'manager') &&
      Boolean(claims.restaurantId);
    return {
      // The restaurant document is only awaited when there is one to await.
      loading: !authResolved || (Boolean(user) && !claimsResolved),
      user,
      claims,
      restaurant,
      isStaff,
      isOwner: claims.role === 'owner',
      signOut: async () => {
        await fbSignOut(firebaseAuth());
      },
      refreshClaims: async () => {
        const next = await readClaims(firebaseAuth().currentUser, true);
        setClaims(next);
        return next;
      },
    };
  }, [authResolved, claimsResolved, user, claims, restaurant, readClaims]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/**
 * The restaurant's timezone, or a sensible default while it loads.
 *
 * Every date in the portal goes through this, so a slow first snapshot renders
 * in the default rather than in the browser's zone.
 */
export function useTimezone(): string {
  const { restaurant } = useAuth();
  return restaurant?.timezone ?? 'Asia/Karachi';
}
