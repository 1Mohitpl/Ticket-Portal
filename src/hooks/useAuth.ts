import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types'

interface AuthState {
  user: { id: string; email?: string | null } | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: unknown }>
  signOut: () => Promise<void>
  inviteUser: (
    email: string,
    role: UserRole,
    scopeId?: string | null,
    scopeType?: 'nbg' | 'zone' | 'branch',
  ) => Promise<{ error: unknown }>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<{ id: string; email?: string | null } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true

    const syncSession = async (u: { id: string; email?: string | null } | null) => {
      if (!mounted) return
      setLoading(true)
      setUser(u)

      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        await loadProfile(u.id)
      } catch {
        if (mounted) setProfile(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    supabase.auth.getUser().then(({ data }) => syncSession(data.user ?? null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      void syncSession(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const loadProfile = useCallback(async (id: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    setProfile((data ?? null) as Profile | null)
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    navigate('/login', { replace: true })
  }

  const inviteUser = async (
    email: string,
    role: UserRole,
    scopeId?: string | null,
    scopeType?: 'nbg' | 'zone' | 'branch',
  ) => {
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email, role, scope_id: scopeId, scope_type: scopeType },
    })
    return { error }
  }

  return { user, profile, loading, signIn, signOut, inviteUser }
}
