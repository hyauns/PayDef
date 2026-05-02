"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

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
  const [language, setLanguageState] = useState<Language>("en")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("paydef_language") as Language
    if (saved === "vi") setLanguageState("vi")
    setMounted(true)
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
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
