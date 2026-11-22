import { useEffect, useMemo, useRef } from 'react'
import 'pannellum/build/pannellum.css'
import 'pannellum/build/pannellum.js'

const BACKEND_ORIGIN = 'http://127.0.0.1:8000'

/**
 * Делает из пути бэкенда полный URL: '/static/uploads/x.jpg' -> 'http://127.0.0.1:8000/static/uploads/x.jpg'.
 * Абсолютные, data: и blob: URL не трогаем. Легаси '/uploads/...' переписываем в '/static/uploads/...'.
 * Пути ассетов фронтенда ('/panoramas/...', '/favicon.svg') остаются относительными:
 * их отдаёт Vite/public, а не бэкенд.
 */
export const resolveMediaUrl = (url) => {
  if (typeof url !== 'string' || !url) return url
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^(data|blob):/i.test(url)) return url
  if (url.startsWith('/uploads/')) return `${BACKEND_ORIGIN}/static${url}`
  if (url.startsWith('/static/')) return `${BACKEND_ORIGIN}${url}`
  return url
}

const normalizeConfig = (config) => {
  if (!config) return config
  const next = { ...config }
  if (next.panorama) next.panorama = resolveMediaUrl(next.panorama)
  if (next.scenes) {
    next.scenes = Object.fromEntries(
      Object.entries(next.scenes).map(([id, scene]) => [
        id,
        scene?.panorama ? { ...scene, panorama: resolveMediaUrl(scene.panorama) } : scene,
      ]),
    )
  }
  return next
}

/**
 * Тонкая React-обёртка над Pannellum.
 * Пакет pannellum — обычный скрипт, который кладёт API в window.pannellum,
 * поэтому здесь достаточно смонтировать контейнер и создать viewer.
 */
export default function PannellumViewer({ config, onReady, className = '' }) {
  const containerRef = useRef(null)
  const safeConfig = useMemo(() => normalizeConfig(config), [config])

  useEffect(() => {
    const container = containerRef.current
    const api = window.pannellum
    if (!container || !api) return undefined

    const viewer = api.viewer(container, safeConfig)
    onReady?.(viewer)

    return () => {
      onReady?.(null)
      try {
        viewer.destroy()
      } catch {
        // Viewer мог быть уже уничтожен при повторном монтировании в StrictMode.
      }
    }
  }, [safeConfig, onReady])

  return <div ref={containerRef} className={`pannellum-viewer ${className}`.trim()} />
}
