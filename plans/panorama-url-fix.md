# Fix: panorama URL must point to the backend origin

Root cause: `/static/uploads/<name>` (and legacy `/uploads/<name>`) is a backend-relative path.
The browser resolves it against the Vite dev origin (`http://localhost:5173`), so Pannellum 404s.
The URL must be prefixed with the backend origin before it reaches Pannellum.

## 1. backend/main.py

Replace the panorama upload block (lines ~456-472) with:

```python
# ---------------------------------------------------------------------------
# Загрузка файлов (360°-панорамы, планы цеха, фото рабочих мест)
# ---------------------------------------------------------------------------

# Абсолютные пути не зависят от текущей рабочей директории процесса uvicorn.
UPLOADS_DIR = Path(UPLOADS_DIR).resolve()
STATIC_DIR = UPLOADS_DIR.parent  # .../backend/static
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

PANORAMA_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


@app.post("/api/upload/panorama")
async def upload_panorama(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in PANORAMA_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый тип файла: {suffix or 'без расширения'}",
        )

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (лимит 25 МБ)")

    unique_filename = f"{uuid.uuid4().hex}{suffix}"
    (UPLOADS_DIR / unique_filename).write_bytes(content)

    # Путь всегда относительный к корню бэкенда и всегда начинается с /static/uploads/.
    return {
        "url": f"/static/uploads/{unique_filename}",
        "filename": unique_filename,
        "original_name": file.filename,
        "size": len(content),
    }


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
```

Notes:
- Removes the duplicated `UPLOAD_DIR = "backend/static/uploads/"` constant (CWD-dependent, silently wrote to the wrong place when uvicorn was started from another directory).
- The mount now uses the same resolved directory the upload writes to, so the file is guaranteed to be served.

## 2. src/store/useVsmStore.js

Add the helper next to `API_URL` (line 7):

```js
const API_URL = 'http://127.0.0.1:8000'

// Путь от бэкенда всегда относительный; легаси /uploads/ реально отдаётся как /static/uploads/.
const normalizeBackendPath = (url) => {
  if (typeof url !== 'string' || !url) return url
  return url.startsWith('/uploads/') ? `/static${url}` : url
}
```

In `uploadPanorama` replace `panorama_url: data.url` with:

```js
        panorama_url: normalizeBackendPath(data.url),
```

Optional (legacy persisted data) — inside `loadFlowFromServer`, before `set({ workshops, ... })`:

```js
    const normalized = workshops.map((workshop) =>
      workshop?.panorama_url
        ? { ...workshop, panorama_url: normalizeBackendPath(workshop.panorama_url) }
        : workshop,
    )

    set({
      workshops: normalized,
      activeWorkshopId: normalized[0]?.id ?? 'w1',
    })
```

## 3. src/components/PannellumViewer.jsx (full file)

```jsx
import { useEffect, useMemo, useRef } from 'react'
import 'pannellum/build/pannellum.css'
import 'pannellum/build/pannellum.js'

const BACKEND_ORIGIN = 'http://127.0.0.1:8000'

/**
 * Приводит путь к файлу бэкенда к абсолютному URL.
 * Pannellum грузит картинку относительно текущего origin (Vite :5173),
 * поэтому бэкенд-пути нужно явно префиксовать origin бэкенда (:8000).
 */
export const resolveMediaUrl = (url) => {
  if (typeof url !== 'string' || !url) return url
  // Уже абсолютный / data: / blob: — не трогаем.
  if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  // Легаси: /uploads/file.jpg реально отдаётся по /static/uploads/file.jpg.
  const path = url.startsWith('/uploads/') ? `/static${url}` : url
  if (path.startsWith('/')) return `${BACKEND_ORIGIN}${path}`
  return path
}

const normalizeConfig = (config) => {
  if (!config) return config

  const next = { ...config }

  if (next.panorama) next.panorama = resolveMediaUrl(next.panorama)
  if (next.background) next.background = resolveMediaUrl(next.background)

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

  // Сериализуем конфиг, чтобы мемоизация не зависела от идентичности объекта
  // (родитель может создавать config инлайн на каждом рендере — иначе viewer
  // пересоздавался бы бесконечно).
  const configKey = JSON.stringify(config ?? {})

  // Функции из config (например, createTooltipFunc у hotSpots) сохраняются:
  // нормализуем исходный объект, а не его JSON-копию.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const safeConfig = useMemo(() => normalizeConfig(config), [configKey])

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
      container.innerHTML = ''
    }
  }, [safeConfig, onReady])

  return <div ref={containerRef} className={`pannellum-viewer ${className}`.trim()} />
}
```

## Result

`/static/uploads/ea6a….jpg` → `http://127.0.0.1:8000/static/uploads/ea6a….jpg`, served by the
`StaticFiles` mount. Legacy `/uploads/…` values in localStorage are rewritten on the fly.

## Verification

1. Upload a panorama from the editor.
2. DevTools → Network: the image request goes to `http://127.0.0.1:8000/static/uploads/...` and returns 200.
3. Reload (F5) with persisted legacy `panorama_url` — still renders (viewer normalizes it).