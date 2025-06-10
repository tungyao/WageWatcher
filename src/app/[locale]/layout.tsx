
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from '@vercel/analytics/next';
import type {Metadata} from 'next';
import {NextIntlClientProvider, useMessages} from 'next-intl';
import '../globals.css'; // Adjust path if necessary
import { Toaster } from "@/components/ui/toaster";
import {locales} from '@/i18n';

// export const metadata: Metadata = { // Metadata can be generated dynamically
//   title: 'WageWatcher',
//   description: 'Track your earnings in real-time!',
// };

export function generateStaticParams() {
  return locales.map((locale) => ({locale}));
}

export async function generateMetadata({params: {locale}}: {params: {locale: string}}): Promise<Metadata> {
  // Optionally, load a messages file to use translations in metadata
  // const messages = (await import(`../../messages/${locale}.json`)).default;
  // const t = createTranslator({locale, messages});
  // For now, simple metadata:
  return {
    title: 'WageWatcher', // Replace with t('Page.title') if using translated metadata
    description: 'Track your earnings in real-time!', // Replace with t('Page.subtitle')
  };
}


export default function LocaleLayout({
  children,
  params: {locale}
}: Readonly<{
  children: React.ReactNode;
  params: {locale: string};
}>) {
  const messages = useMessages();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
          <SpeedInsights />
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
