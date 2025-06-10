
import {getRequestConfig} from 'next-intl/server';
 
export const locales = ['en', 'zh'];
export const defaultLocale = 'en';

export default getRequestConfig(async ({locale}) => {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as any)) {
    // Optionally, you could redirect to a default locale or show a 404 page
    // For now, we'll proceed, but next-intl might handle this if locale is truly unsupported
  }
 
  return {
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
