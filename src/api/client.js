// Единый API-клиент. Базовый URL пустой: запросы идут через Vite-proxy (/api, /uploads → :8000).
// Для production без прокси задайте VITE_API_URL.
export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export const assetUrl = (url) => (url && url.startsWith('/uploads') ? `${API_BASE}${url}` : url)

export async function api(path, { method = 'GET', body, timeout = 4000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
