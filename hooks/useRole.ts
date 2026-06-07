import { useAuth, UserRole } from '../context/AuthContext';

export type { UserRole };

/**
 * Custom hook to get the current authenticated user's role and loading status.
 * Consumes the global AuthContext to prevent redundant queries and UI flashes.
 */
export function useRole() {
  const { role, loading } = useAuth();
  return { role, loading };
}
