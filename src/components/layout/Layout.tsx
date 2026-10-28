import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LogOut, LayoutDashboard, FileText, HardDrive, ShieldAlert, Users, Settings } from 'lucide-react'

const SIDEBAR_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/tickets', label: 'Tickets', icon: FileText },
  { path: '/devices', label: 'Devices', icon: HardDrive },
]

const HO_ONLY_ITEMS = [
  { path: '/assign-si', label: 'Assign SI', icon: ShieldAlert },
  { path: '/insights', label: 'Insights', icon: Settings },
  { path: '/users', label: 'Users', icon: Users },
]

export default function Layout() {
  const { profile, signOut, loading } = useAuth()
  const location = useLocation()

  if (loading) return null

  const isActive = (path: string) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path))

  const items =
    profile?.role === 'head_office' ? [...SIDEBAR_ITEMS, ...HO_ONLY_ITEMS] : SIDEBAR_ITEMS

  return (
    <div className="flex h-screen bg-[#121212]">
      <aside className="w-64 border-r border-[#2c2c2e] bg-[#1e1e1e] flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight">S-Watch 360</h1>
          <p className="text-xs text-[#98989d] mt-1">{profile?.role.replace('_', ' ')}</p>
        </div>
        <nav className="p-4 space-y-1">
          {items.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                isActive(item.path)
                  ? 'bg-[#00e5ff]/10 text-[#00e5ff]'
                  : 'text-[#98989d] hover:bg-[#2c2c2e]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto p-4 border-t border-[#2c2c2e]">
          <button
            onClick={signOut}            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-[#ff453a] hover:bg-[#2c2c2e]"
          >
            <LogOut className="w-5 h-5" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-[#121212] p-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold">{currentPageTitle(location.pathname)}</h2>
            <p className="text-sm text-[#98989d]">{profile?.email}</p>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}

function currentPageTitle(path: string): string {
  const match = [...SIDEBAR_ITEMS, ...HO_ONLY_ITEMS].find((i) => path === i.path || path.startsWith(i.path + '/'))
  return match ? match.label : 'Dashboard'
}
