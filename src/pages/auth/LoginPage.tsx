import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'

const HIGHLIGHTS = [
  'Automatic tickets when a device stays down for 24 hours',
  'Escalation emails to the assigned SI at 24, 48 and 72 hours',
  'Hierarchy-scoped dashboards for HO, NBG, Zone, Branch and SI',
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await signIn(email, password)
    if (err) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <main className="flex min-h-screen bg-[#f4f3ec]">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-linear-to-br from-[#1e0b33] via-[#4c1380] to-[#aa3bff] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-[#aa3bff]/40 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">S-Watch 360</p>
              <p className="text-xs text-white/70">Desk</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Every branch device.
            <br />
            One command center.
          </h2>
          <p className="mt-4 text-sm leading-6 text-white/75">
            Monitor device health across your network, raise tickets automatically and keep every
            System Integrator accountable.
          </p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/85">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© 2026 S-Watch 360 Desk</p>
      </aside>

      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#aa3bff] text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-lg font-semibold tracking-tight">S-Watch 360 Desk</p>
          </div>

          <div className="rounded-2xl border border-[#e5e4e7] bg-white p-7 shadow-[0_18px_50px_-24px_rgba(30,11,51,0.35)] sm:p-9">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight text-[#08060d]">Welcome back</h1>
              <p className="mt-1.5 text-sm text-[#6b6375]">
                Sign in to your account to continue.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-center gap-2.5 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-sm text-[#991b1b]"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#08060d]">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a93a5]"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@bank.com"
                    className="w-full rounded-lg border border-[#e5e4e7] bg-white py-2.5 pl-10 pr-3 text-sm text-[#08060d] placeholder:text-[#9a93a5] transition focus:border-[#aa3bff] focus:outline-none focus:ring-4 focus:ring-[#aa3bff]/15"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#08060d]">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a93a5]"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-[#e5e4e7] bg-white py-2.5 pl-10 pr-11 text-sm text-[#08060d] placeholder:text-[#9a93a5] transition focus:border-[#aa3bff] focus:outline-none focus:ring-4 focus:ring-[#aa3bff]/15"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#9a93a5] transition hover:bg-[#f4f3ec] hover:text-[#6b6375] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aa3bff]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#aa3bff] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#aa3bff]/30 transition hover:bg-[#9914ff] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#aa3bff]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-[#6b6375]">
            Demo credentials are seeded in the Supabase project (see README).
          </p>
        </div>
      </section>
    </main>
  )
}
