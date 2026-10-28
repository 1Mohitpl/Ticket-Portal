import { supabase } from './supabase'

const baseUrl = `${(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/api`

interface ApiOptions extends RequestInit {
  auth?: boolean
}

// Calls the `api` Edge Function with the current Supabase JWT.
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = true, ...init } = options
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('You are not signed in')
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error
    throw new Error(message ?? `Request failed (${response.status})`)
  }

  return body as T
}
