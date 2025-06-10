// This file is intentionally left blank or can be removed.
// The main page content is now handled by src/app/[locale]/page.tsx
// for internationalization.
// The middleware will redirect from '/' to '/[locale]'.

// For `next export` to work, Next.js might still expect a root page.tsx.
// We can make it a simple redirect component or just a minimal placeholder.
// However, next-intl's middleware should handle the redirect from '/'.

export default function RootPage() {
  // This page should ideally not be rendered directly if middleware is set up correctly.
  // It will redirect to /[locale]
  return null; 
}
