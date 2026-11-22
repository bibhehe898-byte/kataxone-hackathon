import { CircleAlert, Lock, LogIn, ShieldCheck, User } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { API_BASE } from '../api/client'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!agreed) {
      setError('Для входа необходимо согласие на обработку персональных данных (ФЗ-152).')
      return
    }

    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginValue, password }),
      })

      if (response.status === 401) {
        setError('Неверный логин или пароль.')
        return
      }

      if (!response.ok) {
        setError('Не удалось войти. Попробуйте позже.')
        return
      }

      const data = await response.json()
      login(data.access_token)
      navigate('/', { replace: true })
    } catch {
      setError('Не удалось подключиться к серверу.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <span className="page-eyebrow">
          <ShieldCheck size={14} aria-hidden="true" />
          Авторизация · ФЗ-152
        </span>
        <h1 className="login-title">Вход в Kataxone</h1>
        <p className="login-subtitle">
          Войдите, чтобы открыть доступ к 3D-туру, редактору КПСЦ и дашборду.
        </p>

        <label className="login-field">
          <span className="login-field__label">Логин</span>
          <span className="login-field__control">
            <User size={15} aria-hidden="true" />
            <input
              type="text"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              placeholder="Введите логин"
              autoComplete="username"
            />
          </span>
        </label>

        <label className="login-field">
          <span className="login-field__label">Пароль</span>
          <span className="login-field__control">
            <Lock size={15} aria-hidden="true" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите пароль"
              autoComplete="current-password"
            />
          </span>
        </label>

        <label className="login-consent">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>Я согласен на обработку персональных данных (ФЗ-152)</span>
        </label>

        {error && (
          <p className="login-error" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--primary login-submit" disabled={loading}>
          <LogIn size={16} aria-hidden="true" />
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
