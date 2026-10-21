'use client';

import { createContext, ReactNode, useContext } from 'react';
import { Locale, TranslationKey, translate } from '@/lib/i18n';

type LocaleContextValue = {
  locale: Locale;
  t: (key: TranslationKey) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  t: (key) => translate('en', key),
});

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={{ locale, t: (key) => translate(locale, key) }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
