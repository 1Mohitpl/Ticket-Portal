import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { apiFetch } from '../../lib/api'
import type { Profile } from '../../types'
import { AlertTriangle, Clock, CheckCircle, Mail } from 'lucide-react'

type Role = Profile['role']

interface Stats {
  total: number
  open: number
  today_open: number
  today_resolved: number
  resolved: number
  escalated: number
}

interface BreakdownRow {
  branch_name: string
  zone_name: string | null
  nbg_name: string | null
  device_serial: string | null
  open: number
  resolved: number
  escalated: number
}

const WIDGETS: Array<{ key: keyof Stats; label: string; icon: React.ElementType; filter: string }> = [
  { key: 'open', label: 'Open Tickets', icon: AlertTriangle, filter: 'open' },
  { key: 'today_open', label: "Today's Open Tickets", icon: Clock, filter: 'today_open' },
  { key: 'today_resolved', label: "Today's Resolved Tickets", icon: CheckCircle, filter: 'today_resolved' },
  { key: 'resolved', label: 'Resolved Tickets', icon: CheckCircle, filter: 'resolved' },
  { key: 'escalated', label: 'Escalated Tickets', icon: Mail, filter: 'escalated' },
]

export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const role = (profile?.role ?? 'head_office') as Role

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => apiFetch<Stats>('/tickets/stats'),
    enabled: !authLoading,
  })

  const countFor = (key: keyof Stats) => stats?.[key] ?? 0

  const { data: breakdownRows, isLoading: tLoading, error: breakdownError } = useQuery({
    queryKey: ['dashboardBreakdown'],
    queryFn: async () => {
      const { data } = await apiFetch<{ data: BreakdownRow[] }>('/tickets/breakdown')
      return data
    },
    enabled: !authLoading,
  })

  const breakdown = computeBreakdown(role, breakdownRows ?? [])

  if (authLoading || isLoading) return <div className="p-4">Loading...</div>
  if (error) return <div className="p-4 text-[#dc2626]">Error loading dashboard: {error.message}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="text-sm text-[#6b6375]">Scope: {scopeLabel(role, profile)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {WIDGETS.map((w) => (
          <div
            key={w.key}
            className="p-4 bg-[#fff] border border-[#e5e4e7] rounded-xl cursor-pointer hover:border-[#aa3bff] transition"
            onClick={() => navigate(`/tickets?filter=${w.filter}`)}
          >
            <div className="text-[#aa3bff]">{countFor(w.key)}</div>
            <div className="text-sm text-[#6b6375]">{w.label}</div>
          </div>
        ))}
      </div>

      <section className="bg-[#fff] border border-[#e5e4e7] rounded-xl p-6">
        <h3 className="font-semibold mb-4">Breakdown by {breakdownTitle(role)}</h3>
        {tLoading ? (
          <div className="p-4">Loading breakdown...</div>
        ) : breakdownError ? (
          <p role="alert" className="text-sm text-[#dc2626]">Could not load breakdown: {breakdownError.message}</p>
        ) : breakdown.length === 0 ? (
          <p className="text-sm text-[#6b6375]">No tickets in scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#e5e4e7] text-[#6b6375]">
                  {breakdownCols(role).map((c) => (
                    <th key={c} className="pb-2 pr-4 font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.label} className="border-b border-[#e5e4e7]/50 hover:bg-[#f4f3ec]/50 transition">
                    <td className="pb-3 pr-4 font-medium">{row.label}</td>
                    {breakdownCols(role).slice(1).map((c) => (
                      <td key={c} className="pb-3 pr-4">{row[c as keyof typeof row]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function scopeLabel(role: Role, profile: Profile | null): string {
  if (role === 'head_office') return 'All branches'
  if (role === 'nbg' && profile?.nbg_id) return `NBG: ${profile.nbg_id}`
  if (role === 'zonal' && profile?.zone_id) return `Zone: ${profile.zone_id}`
  if (role === 'branch' && profile?.branch_id) return `Branch: ${profile.branch_id}`
  if (role === 'si') return 'Assigned branches'
  return 'All branches'
}

function breakdownTitle(role: Role): string {
  const map: Record<Role, string> = {
    head_office: 'NBG',
    nbg: 'Zone',
    zonal: 'Branch',
    branch: 'Device',
    si: 'Assigned Branch',
  }
  return map[role]
}

function breakdownCols(role: Role): string[] {
  const map: Record<Role, string[]> = {
    head_office: ['NBG', 'Open', 'Resolved', 'Escalated'],
    nbg: ['Zone', 'Open', 'Resolved', 'Escalated'],
    zonal: ['Branch', 'Open', 'Resolved', 'Escalated'],
    branch: ['Device', 'Open', 'Resolved', 'Escalated'],
    si: ['Branch', 'Open', 'Resolved', 'Escalated'],
  }
  return map[role]
}

interface Row {
  label: string
  open: number
  resolved: number
  escalated: number
  [key: string]: string | number
}

function computeBreakdown(role: Role, rows: BreakdownRow[]): Row[] {
  const groups = new Map<string, Row>()

  for (const row of rows) {
    const label = role === 'head_office'
      ? row.nbg_name
      : role === 'nbg'
        ? row.zone_name
        : role === 'branch'
          ? (row.device_serial ?? 'Unknown device')
          : row.branch_name
    if (!label) continue

    const cur = groups.get(label) ?? { label, open: 0, resolved: 0, escalated: 0 }
    cur.open += row.open
    cur.resolved += row.resolved
    cur.escalated += row.escalated
    groups.set(label, cur)
  }

  return Array.from(groups.values()).sort((a, b) => b.open - a.open)
}
