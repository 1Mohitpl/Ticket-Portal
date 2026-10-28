import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import type { Ticket, Profile } from '../../types'
import { AlertTriangle, Clock, CheckCircle, Mail } from 'lucide-react'

type Role = Profile['role']

const WIDGETS: Array<{ key: string; label: string; icon: React.ElementType; filter: string }> = [  { key: 'open', label: 'Open Tickets', icon: AlertTriangle, filter: 'open' },
  { key: 'today_open', label: "Today's Open Tickets", icon: Clock, filter: 'today_open' },
  { key: 'today_resolved', label: "Today's Resolved Tickets", icon: CheckCircle, filter: 'today_resolved' },
  { key: 'resolved', label: 'Resolved Tickets', icon: CheckCircle, filter: 'resolved' },
  { key: 'escalated', label: 'Escalated Tickets', icon: Mail, filter: 'escalated' },
]

export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const role = (profile?.role ?? 'head_office') as Role

  const { data: counts, isLoading, error } = useQuery({
    queryKey: ['dashboardCounts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_counts')
      if (error) throw error
      return (data as Array<{ widget: string; value: number; filter_key: string }>) ?? []
    },
    enabled: !authLoading,
  })

  const countFor = (key: string) => counts?.find((c) => c.widget === key)?.value ?? 0

  // Breakdown query scoped by RLS
  const { data: tickets, isLoading: tLoading } = useQuery({
    queryKey: ['dashboardTickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          branches ( id, name, zones ( id, name, nbgs ( id, name ) ) ),
          devices ( id, serial_number )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as Ticket[]) ?? []
    },
    enabled: !authLoading,
  })

  const breakdown = computeBreakdown(role, tickets ?? [])

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

function computeBreakdown(role: Role, tickets: Ticket[]): Row[] {
  const groups = new Map<string, Row>()

  for (const t of tickets) {
    let label = ''
    if (role === 'head_office') {
      const nbg = t.branches?.zones?.nbgs?.name ?? 'Unknown NBG'
      label = nbg
    } else if (role === 'nbg') {
      label = t.branches?.zones?.name ?? 'Unknown Zone'
    } else if (role === 'zonal') {
      label = t.branches?.name ?? 'Unknown Branch'
    } else if (role === 'branch') {
      label = t.devices?.serial_number ?? 'Unknown Device'
    } else if (role === 'si') {
      label = t.branches?.name ?? 'Unknown Branch'
    }
    if (!label) label = 'Unknown'
    const cur = groups.get(label) ?? { label, open: 0, resolved: 0, escalated: 0 }
    if (t.status === 'open') {
      cur.open += 1
      if (t.escalation_level > 0) cur.escalated += 1
    } else {
      cur.resolved += 1
    }
    groups.set(label, cur as Row)
  }

  return Array.from(groups.values()).sort((a, b) => (b.open as number) - (a.open as number))
}
