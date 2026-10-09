"use client"

import React, { createContext, useContext, useState, useSyncExternalStore } from "react"
import { useIsClient } from "@/hooks/use-is-client"

export type Language = "en" | "vi"

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const mounted = useIsClient()
  // The saved choice is read on the client only; a choice made in this tab wins.
  const saved = useSyncExternalStore<Language>(
    () => () => {},
    () => (localStorage.getItem("paydef_language") === "vi" ? "vi" : "en"),
    () => "en"
  )
  const [chosen, setChosen] = useState<Language | null>(null)
  const language = chosen ?? saved

  const setLanguage = (lang: Language) => {
    setChosen(lang)
    localStorage.setItem("paydef_language", lang)
  }

  // To avoid hydration mismatch errors on text, we can either
  // render null or just wait. Since we need to translate many texts,
  // returning the children directly might cause a flash of english
  // then hydration mismatch if the user saved "vi".
  // Returning nothing until mounted is safer for simple i18n without SSR setup.
  if (!mounted) return null

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
