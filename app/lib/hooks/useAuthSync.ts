import { useEffect, useState } from 'react';
import { useUser } from '@clerk/remix';

/**
 * Hook to automatically sync user profile to database when they log in
 * This runs once when the component mounts and the user is authenticated
 */
export function useAuthSync() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only sync if user is loaded, signed in, and we haven't synced yet
    if (isLoaded && isSignedIn && user && !synced && !syncing) {
      syncUserProfile();
    }
  }, [isLoaded, isSignedIn, user, synced, syncing]);

  async function syncUserProfile() {
    setSyncing(true);
    setError(null);

    try {
      const response = await fetch('/api/user-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user?.primaryEmailAddress?.emailAddress,
          firstName: user?.firstName,
          lastName: user?.lastName,
          imageUrl: user?.imageUrl,
        }),
      });

      const data = (await response.json()) as { error?: string; profile?: any };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync user profile');
      }

      console.log('✅ User profile synced successfully:', data.profile);
      setSynced(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error syncing user profile:', errorMessage);
      setError(errorMessage);
    } finally {
      setSyncing(false);
    }
  }

  return {
    synced,
    syncing,
    error,
    retry: syncUserProfile,
  };
}
