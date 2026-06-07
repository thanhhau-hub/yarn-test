import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { AreaWithCount } from '../types';

/**
 * Fetches all active areas with a live count of yarn rolls (LOTs) inside each one.
 * This powers the Board View (home screen).
 * Real-time: re-fetches whenever any yarn_roll is updated.
 */
export function useBoard() {
  const [areas, setAreas] = useState<AreaWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchBoard(retryCount = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

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
        throw error;
      } else {
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
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      // If it's an AbortError (timeout) and we haven't retried yet, retry once
      if (err.name === 'AbortError' && retryCount < 1) {
        console.warn('fetchBoard timed out, retrying...');
        return fetchBoard(retryCount + 1);
      }
      setError(err.message);
    } finally {
      if (retryCount === 0) setLoading(false);
    }
  }

  useEffect(() => {
    fetchBoard();

    const channelId = `board-realtime-${Date.now()}-${Math.random()}`;
    const subscription = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'yarn_rolls' },
        () => {
          fetchBoard(); 
        }
      )
      .subscribe();

    // AppState listener: refetch when returning from background
    const subscriptionAppState = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchBoard();
      }
    });

    return () => {
      supabase.removeChannel(subscription);
      subscriptionAppState.remove();
    };
  }, []);

  return { areas, loading, error, refetch: fetchBoard };
}
