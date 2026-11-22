import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import EditorPage from './pages/EditorPage'
import EnterprisesPage from './pages/EnterprisesPage'
import LoginPage from './pages/LoginPage'
import TourPage from './pages/TourPage'
import { useAuthStore } from './store/useAuthStore'

function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<EnterprisesPage />} />
            <Route path="tour" element={<TourPage />} />
            <Route path="editor" element={<EditorPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
