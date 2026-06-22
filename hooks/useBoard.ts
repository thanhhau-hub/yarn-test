import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { AreaWithCount } from '../types';
import { Session } from '@supabase/supabase-js';

/**
 * Fetches all active areas with a live count of yarn rolls (LOTs) inside each one.
 * This powers the Board View (home screen).
 * Real-time: re-fetches whenever any yarn_roll is updated.
 *
 * IMPORTANT: Pass the current session so this hook waits until auth is ready
 * before fetching. This prevents the "no data on first load" bug.
 */
export function useBoard(session: Session | null | undefined) {
  const [areas, setAreas] = useState<AreaWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  const lastFetchStartedAtRef = useRef(0);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const userId = session?.user?.id;

  const fetchBoard = useCallback(async (retryCount = 0, force = false) => {
    const currentSession = sessionRef.current;
    // session === undefined means auth is still loading — wait
    // session === null means guest mode (no login) — allow fetch (anon key provides read access)
    if (currentSession === undefined) return;

    const now = Date.now();
    if (!force && inFlightRef.current) return;
    if (!force && now - lastFetchStartedAtRef.current < 1000) return;

    const controller = new AbortController();
    inFlightRef.current = controller;
    lastFetchStartedAtRef.current = now;
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    console.log('[useBoard] Fetching board data... session user:', currentSession?.user?.email ?? 'guest');

    try {
      const { data, error } = await supabase
        .from('areas')
        .select(`
          *,
          yarn_rolls (
            id,
            yarn_code,
            area_id,
            status,
            updated_at
          )
        `)
        .eq('is_active', true)
        .order('code')
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        // Supabase wraps AbortError into a response error — silently ignore it
        const msg = error.message || '';
        if (msg.includes('AbortError') || msg.includes('aborted')) {
          if (inFlightRef.current === controller) {
            inFlightRef.current = null;
          }
          return;
        }
        throw error;
      }

      console.log('[useBoard] Got', data?.length, 'areas');
      const formatted: AreaWithCount[] = (data || []).map((area: any) => {
        const activeYarns = (area.yarn_rolls || []).filter(
          (y: any) => y.status === 'in_stock'
        );
        return {
          ...area,
          yarns: activeYarns,
          yarn_count: activeYarns.length,
        };
      });
      setAreas(formatted);
      setError(null);
    } catch (err: any) {
      clearTimeout(timeoutId);

      // AbortError = request cancelled by cleanup (component unmount) or timeout.
      // This is expected — silently clean up and ignore it.
      if (err.name === 'AbortError' || err.message?.includes('AbortError') || err.message?.includes('aborted')) {
        if (inFlightRef.current === controller) {
          inFlightRef.current = null;
        }
        return;
      }

      console.error('Board fetch error:', err);
      setError(err.message);
    } finally {
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
      }
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // session === undefined means "not yet known" (AuthContext still loading) → wait
    // session === null means "guest mode" or "not logged in" → still fetch (anon key)
    // session is a Session object → fetch!
    const currentSession = sessionRef.current;
    if (currentSession === undefined) return;

    if (areas.length === 0) {
      setLoading(true);
    }
    fetchBoard(0, false);

    // Coalesce / Debounce multiple rapid realtime notifications (e.g. bulk operations)
    let debounceTimer: any = null;
    const debouncedFetchBoard = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        // Only fetch if tab is visible on Web, or if it is standard React Native environment
        if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        fetchBoard(0, false);
      }, 3000); // 3-second debounce cooldown
    };

    const channelId = `board-realtime-${Date.now()}-${Math.random()}`;
    const subscription = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'yarn_rolls' },
        () => debouncedFetchBoard()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'areas' },
        () => debouncedFetchBoard()
      )
      .subscribe();

    // Visibility listener for Web CPU saving
    const handleVisibilityChange = () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchBoard(0, false);
      }
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // AppState listener: refetch when returning from background (Native platforms only to save CPU/battery)
    let subscriptionAppState: any = null;
    if (Platform.OS !== 'web') {
      subscriptionAppState = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          fetchBoard(0, false);
        }
      });
    }

    return () => {
      inFlightRef.current?.abort();
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(subscription);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (subscriptionAppState) {
        subscriptionAppState.remove();
      }
    };
  }, [userId, fetchBoard]);

  const refetch = useCallback(() => fetchBoard(0, true), [fetchBoard]);
  return { areas, loading, error, refetch };
}
