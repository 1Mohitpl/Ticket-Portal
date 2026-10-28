import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="flex h-screen items-center center justify-center bg-[#f4f3ec] p-4">
      <div className="w-full max-w-md bg-[#fff] border border-[#e5e4e7] rounded-xl p-8 shadow-md center">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">S-Watch 360</h1>
          <p className="text-sm text-[#6b6375]">Device ticketing &amp; escalation</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded bg-[#fee2e2] text-[#991b1b] text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-5" /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full border border-[#e5e4e7] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#aa3bff]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full border border-[#e5e4e7] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#aa3bff]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#aa3bff] text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-[#9914ff] transition"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-sm text-center text-[#6b6375]">
          Demo credentials are seeded in the Supabase project (see README).
        </p>
      </div>
    </div>
  )
}
