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
  const viewerRef = useRef(null)
  // Колбэк держим в ref: если родитель передаст новую функцию на каждый рендер,
  // viewer не должен пересоздаваться (иначе React и Pannellum одновременно
  // удаляют одни и те же DOM-узлы -> "Failed to execute 'removeChild'").
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])
  const safeConfig = useMemo(() => normalizeConfig(config), [config])

  useEffect(() => {
    const container = containerRef.current
    const api = window.pannellum
    if (!container || !api) return undefined

    // Pannellum вставляет свои узлы прямо в контейнер: чистим его перед созданием,
    // чтобы после StrictMode-перемонтирования не остались «висячие» элементы.
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }

    let viewer
    try {
      viewer = api.viewer(container, safeConfig)
    } catch (error) {
      console.error('Pannellum: не удалось инициализировать viewer', error)
      return undefined
    }
    viewerRef.current = viewer
    onReadyRef.current?.(viewer)

    return () => {
      const current = viewerRef.current
      viewerRef.current = null
      onReadyRef.current?.(null)

      if (current) {
        try {
          // destroy() снимает обработчики и удаляет собственные DOM-узлы внутри
          // контейнера, пока он ещё существует в документе.
          current.destroy()
        } catch {
          // Viewer мог быть уже уничтожен при повторном монтировании в StrictMode.
        }
      }

      // Страховка от "Failed to execute 'removeChild' on 'Node'": если Pannellum
      // не успел убрать узлы (например, панорама ещё грузилась), удаляем их по
      // одному. innerHTML = '' не используем — он рвёт учёт узлов в React.
      while (container.firstChild) {
        try {
          container.removeChild(container.firstChild)
        } catch {
          break
        }
      }
    }
  }, [safeConfig])

  return <div ref={containerRef} className={`pannellum-viewer ${className}`.trim()} />
}
