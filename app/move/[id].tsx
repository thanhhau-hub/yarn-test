import { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';

// Legacy wrapper to preserve external routes to Move screen.
// Redirects to the tab-based Move screen ensuring the bottom navigation stays visible.
export default function MoveRedirect() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (id) {
      router.replace(`/(tabs)/move/${id}`);
    }
  }, [id, router]);

  return null;
}
