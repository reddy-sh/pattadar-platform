import { router } from 'expo-router';
import { useEffect } from 'react';

import { LoginLanding } from '@/components/LoginLanding';
import { useIdentity } from '@/data/hooks';

/** Route wrapper — the landing IS the sign-in; pop back once signed in. */
export default function SignInScreen() {
  const identity = useIdentity();
  useEffect(() => {
    if (identity) router.back();
  }, [identity]);
  return <LoginLanding />;
}
