'use client';

import { useEffect } from 'react';
import { defaultLocale } from '@/i18n';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the default locale's root page.
    // Using replace to not add the root path to browser history.
    router.replace(`/${defaultLocale}`);
  }, [router]);

  // Render nothing or a loading indicator while redirecting.
  // This page should ideally not be visible for long.
  return null;
}
