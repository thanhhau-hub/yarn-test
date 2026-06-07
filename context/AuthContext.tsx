import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

export type UserRole = 'worker' | 'supervisor';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  refetchRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
  refetchRole: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const backgroundTime = useRef<number>(Date.now());

  // Helper to fetch user role from Profiles table with fallback to user metadata
  async function fetchUserRole(userId: string, userMetadataRole?: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setRole(data.role as UserRole);
      } else {
        // Fallback to user metadata role or default worker
        setRole((userMetadataRole || 'worker') as UserRole);
      }
    } catch (err) {
      console.error('Error fetching role in context:', err);
      setRole((userMetadataRole || 'worker') as UserRole);
    }
  }

  useEffect(() => {
    let active = true;

    // Initial session load
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return;
        setSession(session);
        if (session?.user) {
          const metaRole = session.user.user_metadata?.role || 'worker';
          await fetchUserRole(session.user.id, metaRole);
        } else {
          setRole(null);
        }
      })
      .catch((err) => {
        console.error('Error in initial session load:', err);
      })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!active) return;
      if (event === 'TOKEN_REFRESH_ERROR') {
        console.warn('Auth token refresh failed. Signing out.');
        await supabase.auth.signOut();
        setSession(null);
        setRole(null);
        setLoading(false);
        return;
      }
      setSession(currentSession);
      if (currentSession?.user) {
        const metaRole = currentSession.user.user_metadata?.role || 'worker';
        await fetchUserRole(currentSession.user.id, metaRole);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    // Global AppState listener to force token refresh when waking up from background
    const subscriptionAppState = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState.match(/inactive|background/)) {
        backgroundTime.current = Date.now();
      } else if (nextAppState === 'active') {
        const timeAway = Date.now() - backgroundTime.current;
        // If away for more than 30s, explicitly request session to un-stick token refresh locks
        if (timeAway > 30000) {
          supabase.auth.getSession().catch(console.warn);
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      subscriptionAppState.remove();
    };
  }, []);

  const refetchRole = async () => {
    if (session?.user) {
      const metaRole = session.user.user_metadata?.role || 'worker';
      await fetchUserRole(session.user.id, metaRole);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, role, loading, refetchRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
