import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const RoleContext = createContext({ role: null, profile: null, loading: true })

// Paths each role is allowed to visit (null = all paths allowed)
export const ROLE_PATHS = {
  admin:    null,
  operator: new Set(['/production', '/plating']),
  quality:  new Set(['/rm-requirement', '/rm-lot', '/plating', '/dispatch']),
  member:   new Set(['/rm-requirement', '/rm-lot', '/plating', '/dispatch']), // legacy → same as quality
}

// Where to land after login (or on redirect from unauthorized page)
export const ROLE_HOME = {
  admin:    '/dashboard',
  operator: '/production',
  quality:  '/rm-requirement',
  member:   '/rm-requirement',
}

export function RoleProvider({ children }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading]  = useState(true)

  async function fetchProfile(uid) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', uid)
      .single()

    if (!data) {
      const { data: created } = await supabase
        .from('user_profiles')
        .insert({ id: uid, email: user?.email, display_name: user?.email?.split('@')[0], role: 'quality' })
        .select()
        .single()
      setProfile(created)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (user) { setLoading(true); fetchProfile(user.id) }
    else { setProfile(null); setLoading(false) }
  }, [user?.id])

  return (
    <RoleContext.Provider value={{ role: profile?.role ?? null, profile, loading, refetch: () => user && fetchProfile(user.id) }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() { return useContext(RoleContext) }
