import { useEffect, useRef, useState } from 'react'
import { apiUrl, exchangeGoogleCredential, type AuthSession } from '../lib/api'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export function GoogleSignInButton({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  useEffect(() => {
    if (!clientId || !apiUrl || !mountRef.current) return
    let cancelled = false
    const render = () => {
      if (cancelled || !window.google || !mountRef.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            setError('')
            onAuthenticated(await exchangeGoogleCredential(credential))
          } catch {
            setError('Google認証を完了できませんでした')
          }
        },
      })
      window.google.accounts.id.renderButton(mountRef.current, { theme: 'outline', size: 'large', width: 296, text: 'signin_with' })
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-btf-google]')
    if (existing) {
      if (window.google) render()
      else existing.addEventListener('load', render, { once: true })
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.btfGoogle = 'true'
      script.addEventListener('load', render, { once: true })
      document.head.appendChild(script)
    }
    return () => { cancelled = true }
  }, [clientId, onAuthenticated])

  if (!clientId || !apiUrl) {
    return <button className="google-button" disabled><span>G</span> Google OIDC 未設定</button>
  }
  return <><div className="google-signin-mount" ref={mountRef} />{error && <p className="auth-error">{error}</p>}</>
}
