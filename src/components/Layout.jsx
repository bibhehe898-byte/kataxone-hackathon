import { Boxes, Building2, ChartColumn, Compass, LogOut, Workflow } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useEnterpriseStore } from '../store/useEnterpriseStore'
import './Layout.css'
import '../pages/Tour3D.css'

const NAV_ITEMS = [
  { to: '/', label: 'Предприятия', icon: Building2, end: true },
  { to: '/tour', label: '3D-тур', icon: Compass },
  { to: '/editor', label: 'Редактор КПСЦ', icon: Workflow },
  { to: '/dashboard', label: 'Дашборд До/После', icon: ChartColumn },
]

export default function Layout() {
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const enterprises = useEnterpriseStore((s) => s.enterprises)
  const activeId = useEnterpriseStore((s) => s.activeEnterpriseId)
  const loadEnterprises = useEnterpriseStore((s) => s.loadEnterprises)
  const selectEnterprise = useEnterpriseStore((s) => s.selectEnterprise)

  useEffect(() => {
    if (!useEnterpriseStore.getState().enterprises.length) loadEnterprises()
  }, [loadEnterprises])

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" aria-label="Kataxone — на главную">
          <span className="brand-mark">
            <Boxes size={19} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="brand-text">
            <strong>Kataxone</strong>
            <small>3D-карта потока создания ценности</small>
          </span>
        </NavLink>

        <nav className="app-nav" aria-label="Основная навигация">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
            >
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              <span className="nav-link__label">{label}</span>
            </NavLink>
          ))}
        </nav>

        {enterprises.length > 0 && (
          <select
            className="tour-select"
            aria-label="Активное предприятие"
            value={activeId ?? ''}
            onChange={(e) => {
              if (e.target.value === '__all') navigate('/')
              else selectEnterprise(e.target.value)
            }}
            style={{ maxWidth: 220 }}
          >
            {enterprises.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
            <option value="__all">Все предприятия…</option>
          </select>
        )}

        <span className="header-status" title="Версия MVP">
          <span className="status-dot" aria-hidden="true" />
          MVP&nbsp;0.1
        </span>

        <button type="button" className="btn" onClick={logout}>
          <LogOut size={15} aria-hidden="true" />
          Выйти
        </button>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
