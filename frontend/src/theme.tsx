import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'bingesync-theme'

function readStored(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') {
      return v
    }
  } catch {
    /* ignore */
  }
  return null
}

function resolveDark(stored: 'light' | 'dark' | null, osDark: boolean): boolean {
  if (stored === 'dark') {
    return true
  }
  if (stored === 'light') {
    return false
  }
  return osDark
}

function applyDomDark(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

export interface ThemeContextValue {
  isDark: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<'light' | 'dark' | null>(() =>
    typeof window !== 'undefined' ? readStored() : null,
  )
  const [osDark, setOsDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setOsDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = useMemo(() => resolveDark(stored, osDark), [stored, osDark])

  useEffect(() => {
    applyDomDark(isDark)
  }, [isDark])

  const toggleTheme = useCallback(() => {
    const nextDark = !resolveDark(stored, osDark)
    const next: 'light' | 'dark' = nextDark ? 'dark' : 'light'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    setStored(next)
    applyDomDark(nextDark)
  }, [stored, osDark])

  const value = useMemo(() => ({ isDark, toggleTheme }), [isDark, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      className={`text-secondary hover:text-primary transition-colors p-2 rounded-lg hover:bg-surface-container-low disabled:opacity-50 ${className}`}
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="material-symbols-outlined" aria-hidden>
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}
