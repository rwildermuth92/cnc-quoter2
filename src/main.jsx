import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Auth from './Auth.jsx'
import ConfirmedPage from './ConfirmedPage'
import { supabase } from './lib/supabaseClient'

function Root() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const isConfirmation = window.location.hash.includes('type=signup') ||
    window.location.search.includes('type=signup') ||
    window.location.hash.includes('access_token')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (isConfirmation) return <ConfirmedPage />
  if (loading) return <div>Loading...</div>
  return user ? <App user={user} /> : <Auth />
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Root /></StrictMode>
)