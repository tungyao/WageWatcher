
import createMiddleware from 'next-intl/middleware';
import {locales, defaultLocale} from './i18n';
 
export default createMiddleware({
  // A list of all locales that are supported
  locales: locales,
 
  // Used when no locale matches
  defaultLocale: defaultLocale,
  localePrefix: 'as-needed' // Only add locale prefix if it's not the default
});
 
export const config = {
  // Match only internationalized pathnames
  // Adjust this regex if you have other paths that should not be internationalized
  matcher: ['/', '/(zh|en)/:path*']
};
