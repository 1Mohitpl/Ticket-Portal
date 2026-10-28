import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import type { Profile, UserRole } from '../types'

interface LoginResponse {
  access_token: string
  refresh_token: string
  user: Profile
}

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

  const loadProfile = useCallback(async (id: string) => {
    try {
      const { user: loaded } = await apiFetch<{ user: Profile }>('/auth/me')
      setProfile(loaded?.id === id ? loaded : null)
    } catch {
      setProfile(null)
    }
  }, [])

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
      // Defer: calling auth methods (getSession) inside this callback can deadlock.
      setTimeout(() => {
        if (mounted) void syncSession(session?.user ?? null)
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = async (email: string, password: string) => {
    try {
      const session = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        auth: false,
      })
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      return { error }
    } catch (error) {
      return { error }
    }
  }

  const signOut = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // Best effort: clear the local session even if the API is unreachable.
    }
    try {
      await supabase.auth.signOut()
    } catch {
      // Local state is cleared below regardless.
    }
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
