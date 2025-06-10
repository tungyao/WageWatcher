// This file is intentionally left blank or can be removed.
// The root layout is now handled by src/app/[locale]/layout.tsx
// for internationalization.
// If you have global providers or context that MUST be outside the [locale] segment,
// you might need a more complex setup, but for most cases with next-intl,
// the [locale] layout becomes the primary root layout.

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return <>{children}</>;
// }
// For now, let's make it minimal to avoid conflicts, or it can be deleted if not needed
// by a specific root-level structure not handled by next-intl's [locale] convention.
// For `next export` to work smoothly with App Router and `next-intl`, having a root layout
// at `app/layout.tsx` is still generally expected by Next.js, even if `[locale]/layout.tsx`
// is the one doing the heavy lifting.

import type { Metadata } from 'next';

// This metadata will likely be overridden by the [locale] layout or page.
export const metadata: Metadata = {
  title: 'WageWatcher',
  description: 'Track your earnings in real-time!',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en"> {/* Default lang, will be overridden by [locale] layout */}
      <body>
        {children}
      </body>
    </html>
  );
}
