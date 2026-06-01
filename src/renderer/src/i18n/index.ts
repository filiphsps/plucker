import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import de from './locales/de'
import type { Language } from '../../../shared/types'

export const resources = {
  en: { translation: en },
  de: { translation: de }
} as const

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

/** Map a language setting + OS locale to a concrete supported locale. */
export function resolveLocale(setting: Language, systemLocale: string): 'en' | 'de' {
  if (setting !== 'system') return setting
  return systemLocale.toLowerCase().startsWith('de') ? 'de' : 'en'
}

/** Resolve and apply the UI language from the given setting (consulting the OS when 'system'). */
export async function applyLanguage(setting: Language): Promise<void> {
  const systemLocale = setting === 'system' ? await window.plucker.getSystemLocale() : ''
  await i18n.changeLanguage(resolveLocale(setting, systemLocale))
}

export default i18n
