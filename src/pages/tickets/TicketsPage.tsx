import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Ticket } from '../../types'

const PAGE_SIZE = 20
type Sort = 'created_desc' | 'created_asc' | 'level_desc' | 'ticket_asc'
type TicketRow = Ticket & {
  branches: { name: string; code: string } | null
  devices: { serial_number: string } | null
  si_user: { name: string; email: string } | null
}
type BranchOption = { id: string; name: string; code: string }

export default function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const filter = searchParams.get('filter') || 'all'
  const status = searchParams.get('status') || ''
  const level = searchParams.get('level') || ''
  const branch = searchParams.get('branch') || ''
  const device = searchParams.get('device') || ''
  const from = searchParams.get('from') || ''
  const to = searchParams.get('to') || ''
  const search = searchParams.get('search') || ''
  const sort = (searchParams.get('sort') || 'created_desc') as Sort
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const updateParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.set('page', '1')
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  const branchesQuery = useQuery({
    queryKey: ['ticketBranchOptions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id, name, code').order('name')
      if (error) throw error
      return (data ?? []) as BranchOption[]
    },
  })

  const ticketsQuery = useQuery({
    queryKey: ['tickets', filter, status, level, branch, device, from, to, search, sort, page],
    queryFn: async () => {
      let deviceIds: string[] | null = null
      if (device.trim()) {
        const { data, error } = await supabase
          .from('devices')
          .select('id')
          .ilike('serial_number', `%${device.trim()}%`)
        if (error) throw error
        deviceIds = (data ?? []).map((item) => item.id as string)
        if (deviceIds.length === 0) return { items: [] as TicketRow[], total: 0 }
      }

      let query = supabase
        .from('tickets')
        .select('*, branches(name, code), devices(serial_number), si_user:profiles(name, email)', { count: 'exact' })

      if (filter === 'open' || filter === 'today_open' || filter === 'escalated') query = query.eq('status', 'open')
      if (filter === 'resolved' || filter === 'today_resolved') query = query.eq('status', 'resolved')
      if (filter === 'escalated') query = query.gt('escalation_level', 0)
      if (filter === 'today_open' || filter === 'today_resolved') {
        const { start, next } = kolkataDayBounds(kolkataToday())
        const column = filter === 'today_resolved' ? 'resolved_at' : 'created_at'
        query = query.gte(column, start).lt(column, next)
      }
      if (status) query = query.eq('status', status)
      if (level) query = query.eq('escalation_level', Number(level))
      if (branch) query = query.eq('branch_id', branch)
      if (deviceIds) query = query.in('device_id', deviceIds)
      if (from) query = query.gte('created_at', kolkataDayBounds(from).start)
      if (to) query = query.lt('created_at', kolkataDayBounds(to).next)
      if (search.trim()) query = query.ilike('ticket_number', `%${search.trim()}%`)

      if (sort === 'created_asc') query = query.order('created_at', { ascending: true })
      else if (sort === 'level_desc') query = query.order('escalation_level', { ascending: false }).order('created_at', { ascending: false })
      else if (sort === 'ticket_asc') query = query.order('ticket_number', { ascending: true })
      else query = query.order('created_at', { ascending: false })

      const startIndex = (page - 1) * PAGE_SIZE
      const { data, error, count } = await query.range(startIndex, startIndex + PAGE_SIZE - 1)
      if (error) throw error
      return { items: (data ?? []) as unknown as TicketRow[], total: count ?? 0 }
    },
  })

  const tickets = ticketsQuery.data?.items ?? []
  const total = ticketsQuery.data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const setPage = (nextPage: number) => updateParam('page', String(nextPage))

  if (ticketsQuery.isLoading) return <p className="p-4" role="status">Loading tickets…</p>
  if (ticketsQuery.error) return (
    <div className="space-y-3 p-4" role="alert">
      <p className="text-[#dc2626]">Could not load tickets: {ticketsQuery.error.message}</p>
      <button onClick={() => void ticketsQuery.refetch()} className="rounded border border-[#e5e4e7] px-3 py-2 text-sm">Try again</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Tickets</h2>
          <p className="text-sm text-[#6b6375]">{total} ticket{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Ticket presets">
          {[
            ['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved'], ['escalated', 'Escalated'],
            ['today_open', "Today's open"], ['today_resolved', "Today's resolved"],
          ].map(([value, label]) => (
            <button key={value} onClick={() => updateParam('filter', value === 'all' ? '' : value)}
              aria-pressed={filter === value}
              className={`rounded border px-3 py-1.5 text-sm ${filter === value ? 'border-[#aa3bff] bg-[#aa3bff] text-white' : 'border-[#e5e4e7]'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-[#e5e4e7] bg-white p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ticket filters">
        <label className="text-xs text-[#6b6375]">Status
          <select value={status} onChange={(event) => updateParam('status', event.target.value)} className="mt-1 block w-full rounded border border-[#e5e4e7] bg-white px-3 py-2 text-sm text-[#08060d]">
            <option value="">Any status</option><option value="open">Open</option><option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="text-xs text-[#6b6375]">Escalation level
          <select value={level} onChange={(event) => updateParam('level', event.target.value)} className="mt-1 block w-full rounded border border-[#e5e4e7] bg-white px-3 py-2 text-sm text-[#08060d]">
            <option value="">Any level</option><option value="0">Not escalated</option><option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option>
          </select>
        </label>
        <label className="text-xs text-[#6b6375]">Branch
          <select value={branch} onChange={(event) => updateParam('branch', event.target.value)} className="mt-1 block w-full rounded border border-[#e5e4e7] bg-white px-3 py-2 text-sm text-[#08060d]">
            <option value="">All visible branches</option>
            {(branchesQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}
          </select>
        </label>
        <label className="text-xs text-[#6b6375]">Device serial
          <input value={device} onChange={(event) => updateParam('device', event.target.value)} placeholder="Search serial number" className="mt-1 block w-full rounded border border-[#e5e4e7] px-3 py-2 text-sm text-[#08060d]" />
        </label>
        <label className="text-xs text-[#6b6375]">Created from
          <input type="date" value={from} onChange={(event) => updateParam('from', event.target.value)} className="mt-1 block w-full rounded border border-[#e5e4e7] px-3 py-2 text-sm text-[#08060d]" />
        </label>
        <label className="text-xs text-[#6b6375]">Created through
          <input type="date" value={to} onChange={(event) => updateParam('to', event.target.value)} className="mt-1 block w-full rounded border border-[#e5e4e7] px-3 py-2 text-sm text-[#08060d]" />
        </label>
        <label className="text-xs text-[#6b6375]">Sort by
          <select value={sort} onChange={(event) => updateParam('sort', event.target.value)} className="mt-1 block w-full rounded border border-[#e5e4e7] bg-white px-3 py-2 text-sm text-[#08060d]">
            <option value="created_desc">Newest first</option><option value="created_asc">Oldest first</option><option value="level_desc">Highest escalation</option><option value="ticket_asc">Ticket number</option>
          </select>
        </label>
        <label className="text-xs text-[#6b6375]">Search ticket number
          <span className="mt-1 flex items-center rounded border border-[#e5e4e7] px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-[#6b6375]" aria-hidden="true" />
            <input value={search} onChange={(event) => updateParam('search', event.target.value)} placeholder="e.g. SW-000123" className="min-w-0 flex-1 py-2 text-sm text-[#08060d] outline-none" />
          </span>
        </label>
        <div className="flex items-end">
          <button onClick={() => setSearchParams(new URLSearchParams())} className="w-full rounded border border-[#e5e4e7] px-3 py-2 text-sm hover:bg-[#f4f3ec]">Clear filters</button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-[#e5e4e7]">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <thead><tr className="border-b border-[#e5e4e7] bg-[#f4f3ec] text-[#6b6375]">
            <th className="px-4 py-3 font-medium">Ticket</th><th className="px-4 py-3 font-medium">Branch / Device</th><th className="px-4 py-3 font-medium">Assigned SI</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Escalation</th><th className="px-4 py-3 font-medium">Created</th><th className="px-4 py-3 font-medium">Age</th>
          </tr></thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} role="link" aria-label={`Open ticket ${ticket.ticket_number}`} tabIndex={0} onClick={() => navigate(`/tickets/${ticket.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/tickets/${ticket.id}`) } }} className="cursor-pointer border-b border-[#e5e4e7]/60 hover:bg-[#f4f3ec]/60 focus:bg-[#f4f3ec]">
                <td className="px-4 py-3 font-semibold">{ticket.ticket_number}</td>
                <td className="px-4 py-3"><div className="font-medium">{ticket.branches?.name ?? '—'}</div><div className="text-xs text-[#6b6375]">{ticket.devices?.serial_number ?? '—'}</div></td>
                <td className="px-4 py-3">{ticket.si_user?.name ?? ticket.si_user?.email ?? '—'}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${ticket.status === 'open' ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#dcfce7] text-[#15803d]'}`}>{ticket.status === 'open' ? 'Open' : 'Resolved'}</span></td>
                <td className="px-4 py-3">{ticket.escalation_level ? <span className={`rounded-full px-2 py-1 text-xs font-medium ${ticket.escalation_level === 1 ? 'bg-[#fef3c7] text-[#92400e]' : ticket.escalation_level === 2 ? 'bg-[#ffedd5] text-[#9a3412]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>Level {ticket.escalation_level}</span> : <span className="text-[#6b6375]">Not escalated</span>}</td>
                <td className="whitespace-nowrap px-4 py-3">{new Date(ticket.created_at).toLocaleString()}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[#6b6375]">{ticketAge(ticket.created_at, ticket.status === 'resolved' ? ticket.resolved_at : null)}</td>
              </tr>
            ))}
            {tickets.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#6b6375]">No tickets match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-[#6b6375]">
        <span>{total === 0 ? 'No results' : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}</span>
        <div className="flex items-center gap-2">
          <span>Page {totalPages ? Math.min(page, totalPages) : 0} of {totalPages}</span>
          <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-[#e5e4e7] p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <button aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border border-[#e5e4e7] p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}

function kolkataToday(): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function kolkataDayBounds(day: string): { start: string; next: string } {
  const [year, month, date] = day.split('-').map(Number)
  const offsetMinutes = 330
  return {
    start: new Date(Date.UTC(year, month - 1, date) - offsetMinutes * 60_000).toISOString(),
    next: new Date(Date.UTC(year, month - 1, date + 1) - offsetMinutes * 60_000).toISOString(),
  }
}

function ticketAge(createdAt: string, resolvedAt: string | null | undefined): string {
  const elapsedMs = Math.max(0, new Date(resolvedAt ?? Date.now()).getTime() - new Date(createdAt).getTime())
  const hours = Math.floor(elapsedMs / 3_600_000)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`
}
