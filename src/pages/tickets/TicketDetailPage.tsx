import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Clock, Mail, MessageSquare, RefreshCw } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import type { TicketEvent } from '../../types'

type TicketDetail = {
  id: string
  ticket_number: string
  branch_id: string
  device_id: string | null
  si_user_id: string | null
  status: 'open' | 'resolved'
  escalation_level: number
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  branches: { name: string; code: string; zones: { name: string; nbgs: { name: string } | null } | null } | null
  devices: { type: string; serial_number: string; status: string; status_since: string } | null
  si_user: { id: string; name: string; email: string } | null
  resolver: { name: string; email: string } | null
}
type TimelineItem = TicketEvent & { actor: { name: string; email: string } | null }
type EmailItem = { id: string; subject: string; status: string; sent_at: string | null; created_at: string; error: string | null }

export default function TicketDetailPage() {
  const { ticketId } = useParams()
  const { profile, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState('')

  const ticketQuery = useQuery({
    queryKey: ['ticket', ticketId],
    enabled: Boolean(ticketId) && !authLoading,
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select(`
        *, branches:branches!tickets_branch_id_fkey(name, code, zones:zones!branches_zone_id_fkey(name, nbgs:nbgs!zones_nbg_id_fkey(name))),
        devices:devices!tickets_device_id_fkey(type, serial_number, status, status_since),
        si_user:profiles!tickets_si_user_id_fkey(id, name, email), resolver:profiles!tickets_resolved_by_fkey(name, email)
      `).eq('id', ticketId!).maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Ticket not found or you do not have access to it.')
      return data as unknown as TicketDetail
    },
  })
  const eventsQuery = useQuery({
    queryKey: ['ticketEvents', ticketId],
    enabled: Boolean(ticketId) && !authLoading,
    queryFn: async () => {
      const { data, error } = await supabase.from('ticket_events')
        .select('id, ticket_id, event_type, actor_id, actor_role, note, created_at, actor:profiles!ticket_events_actor_id_fkey(name, email)')
        .eq('ticket_id', ticketId!).order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as TimelineItem[]
    },
  })
  const emailsQuery = useQuery({
    queryKey: ['ticketEmails', ticketId],
    enabled: Boolean(ticketId) && !authLoading,
    queryFn: async () => {
      const { data, error } = await supabase.from('email_outbox')
        .select('id, subject, status, sent_at, created_at, error').eq('ticket_id', ticketId!).order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as EmailItem[]
    },
  })

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('add_ticket_note', { p_ticket_id: ticketId!, p_note: note.trim() })
      if (error) throw error
    },
    onSuccess: async () => {
      setNote('')
      setActionError('')
      await queryClient.invalidateQueries({ queryKey: ['ticketEvents', ticketId] })
    },
    onError: (error: Error) => setActionError(error.message),
  })
  const resolve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('resolve_ticket', { p_ticket_id: ticketId!, p_note: note.trim() || null })
      if (error) throw error
    },
    onSuccess: async () => {
      setNote('')
      setActionError('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
        queryClient.invalidateQueries({ queryKey: ['ticketEvents', ticketId] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboardCounts'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboardTickets'] }),
      ])
    },
    onError: (error: Error) => setActionError(error.message),
  })

  if (authLoading || ticketQuery.isLoading) return <p className="p-4" role="status">Loading ticket…</p>
  if (ticketQuery.error || !ticketQuery.data) return <div className="space-y-3 p-4" role="alert"><p className="text-[#dc2626]">Could not load ticket: {ticketQuery.error?.message ?? 'Ticket not found.'}</p><button onClick={() => void ticketQuery.refetch()} className="rounded border border-[#e5e4e7] px-3 py-2 text-sm">Try again</button></div>

  const ticket = ticketQuery.data
  const canManage = ticket.status === 'open' && (profile?.role === 'head_office' || (profile?.role === 'si' && ticket.si_user_id === profile.id))
  const busy = addNote.isPending || resolve.isPending
  const items = [
    ...(eventsQuery.data ?? []).map((event) => ({ id: event.id, kind: 'event' as const, at: event.created_at, event })),
    ...(emailsQuery.data ?? []).map((email) => ({ id: email.id, kind: 'email' as const, at: email.sent_at ?? email.created_at, email })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/tickets" className="inline-flex items-center gap-2 text-sm text-[#6b6375] hover:text-[#aa3bff]"><ArrowLeft className="h-4 w-4" />Back to tickets</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm text-[#6b6375]">Ticket</p><h2 className="text-2xl font-bold">{ticket.ticket_number}</h2><p className="mt-1 text-sm text-[#6b6375]">Created {formatDate(ticket.created_at)} · Age {ticketAge(ticket.created_at, ticket.status === 'resolved' ? ticket.resolved_at : null)}</p></div>
        <div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-sm font-medium ${ticket.status === 'open' ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#dcfce7] text-[#15803d]'}`}>{ticket.status === 'open' ? 'Open' : 'Resolved'}</span><span className={`rounded-full px-3 py-1 text-sm font-medium ${ticket.escalation_level === 3 ? 'bg-[#fee2e2] text-[#991b1b]' : ticket.escalation_level === 2 ? 'bg-[#ffedd5] text-[#9a3412]' : ticket.escalation_level === 1 ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#f4f3ec] text-[#6b6375]'}`}>{ticket.escalation_level ? `Level ${ticket.escalation_level}` : 'Not escalated'}</span></div>
      </div>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-[#e5e4e7] bg-white p-5 sm:grid-cols-2" aria-label="Ticket information">
        <Info label="Branch" value={`${ticket.branches?.name ?? '—'}${ticket.branches?.code ? ` (${ticket.branches.code})` : ''}`} />
        <Info label="Region" value={[ticket.branches?.zones?.nbgs?.name, ticket.branches?.zones?.name].filter(Boolean).join(' / ') || '—'} />
        <Info label="Device" value={ticket.devices ? `${ticket.devices.type} · ${ticket.devices.serial_number}` : '—'} />
        <Info label="Device status" value={ticket.devices ? `${ticket.devices.status.replace('_', ' ')} since ${formatDate(ticket.devices.status_since)}` : '—'} />
        <Info label="Assigned SI" value={ticket.si_user?.name ?? (ticket.si_user_id === profile?.id ? profile.name : ticket.si_user?.email) ?? '—'} />
        <Info label="Resolved" value={ticket.resolved_at ? `${formatDate(ticket.resolved_at)}${ticket.resolver?.name ? ` by ${ticket.resolver.name}` : ''}` : 'Not resolved'} />
        {ticket.resolution_note && <div className="sm:col-span-2"><Info label="Resolution note" value={ticket.resolution_note} /></div>}
      </section>

      {canManage && <section className="space-y-3 rounded-xl border border-[#e5e4e7] bg-white p-5" aria-label="Ticket actions">
        <h3 className="font-semibold">Update ticket</h3>
        <label htmlFor="ticket-note" className="block text-sm text-[#6b6375]">Add a note (optional when resolving)</label>
        <textarea id="ticket-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={2000} className="w-full rounded border border-[#e5e4e7] p-3 text-sm" placeholder="Add an update or resolution note…" />
        {actionError && <p role="alert" className="text-sm text-[#dc2626]">{actionError}</p>}
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !note.trim()} onClick={() => addNote.mutate()} className="inline-flex items-center gap-2 rounded border border-[#e5e4e7] px-4 py-2 text-sm disabled:opacity-50"><MessageSquare className="h-4 w-4" />{addNote.isPending ? 'Adding…' : 'Add note'}</button>
          <button disabled={busy} onClick={() => resolve.mutate()} className="inline-flex items-center gap-2 rounded bg-[#15803d] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><CheckCircle className="h-4 w-4" />{resolve.isPending ? 'Resolving…' : 'Mark resolved'}</button>
        </div>
      </section>}

      <section className="rounded-xl border border-[#e5e4e7] bg-white p-5">
        <h3 className="mb-4 font-semibold">Activity timeline</h3>
        {(eventsQuery.isLoading || emailsQuery.isLoading) ? <p role="status" className="text-sm text-[#6b6375]">Loading activity…</p> : (eventsQuery.error || emailsQuery.error) ? <div role="alert" className="space-y-2 text-sm text-[#dc2626]"><p>Could not load all ticket activity: {eventsQuery.error?.message ?? emailsQuery.error?.message}</p><button onClick={() => { void eventsQuery.refetch(); void emailsQuery.refetch() }} className="inline-flex items-center gap-1 rounded border border-[#e5e4e7] px-3 py-1 text-[#08060d]"><RefreshCw className="h-3 w-3" />Retry</button></div> : items.length === 0 ? <p className="text-sm text-[#6b6375]">No activity has been recorded yet.</p> : <ol className="space-y-4">{items.map((item) => item.kind === 'event' ? <li key={item.id} className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#aa3bff]" /><div className="min-w-0"><p className="font-medium">{eventTitle(item.event.event_type)}</p><p className="text-xs text-[#6b6375]">{formatDate(item.event.created_at)} · {item.event.actor?.name ?? item.event.actor_role?.replace('_', ' ') ?? 'System'}</p>{item.event.note && <p className="mt-1 whitespace-pre-wrap text-sm">{item.event.note}</p>}</div></li> : <li key={item.id} className="flex gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#6b6375]" /><div><p className="font-medium">Escalation email {item.email.status}</p><p className="text-xs text-[#6b6375]">{formatDate(item.at)} · {item.email.subject}</p>{item.email.error && <p className="mt-1 text-sm text-[#dc2626]">{item.email.error}</p>}</div></li>)}</ol>}
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-[#6b6375]">{label}</p><p className="mt-1 text-sm">{value}</p></div> }
function formatDate(value: string) { return new Date(value).toLocaleString() }
function ticketAge(start: string, end: string | null) { const ms = Math.max(0, new Date(end ?? Date.now()).getTime() - new Date(start).getTime()); const hours = Math.floor(ms / 3_600_000); return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h` }
function eventTitle(type: string) { return ({ created: 'Ticket created', escalated: 'Ticket escalated', note: 'Note added', resolved: 'Ticket resolved' } as Record<string, string>)[type] ?? type.replaceAll('_', ' ')}
