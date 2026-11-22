import { Box, Camera, Flame, MapPin, Plus, Route as RouteIcon, ScanEye, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl } from '../api/client'
import Hall3D from '../components/tour3d/Hall3D'
import XRayDrawer from '../components/tour3d/XRayDrawer'
import PannellumViewer from '../components/PannellumViewer'
import { useEnterpriseStore } from '../store/useEnterpriseStore'
import { useVsmStore } from '../store/useVsmStore'
import { findRounds, heatInfo, routeMetrics } from '../utils/metrics'
import './TourPage.css'
import './Tour3D.css'

const EMPTY_POI = {
  title: '',
  case_problem: '',
  case_solution: '',
  metric_before: '',
  metric_after: '',
  type: 'info',
  node_id: '',
}

const LEGEND = [50, 70, 87, 95, 110].map((v) => heatInfo(v))

export default function TourPage() {
  const navigate = useNavigate()
  const enterprises = useEnterpriseStore((s) => s.enterprises)
  const loadEnterprises = useEnterpriseStore((s) => s.loadEnterprises)
  const activeEnterpriseId = useEnterpriseStore((s) => s.activeEnterpriseId)
  const activeWorkshopId = useEnterpriseStore((s) => s.activeWorkshopId)
  const setActiveWorkshop = useEnterpriseStore((s) => s.setActiveWorkshop)
  const setPanorama = useEnterpriseStore((s) => s.setPanorama)
  const addPoi = useEnterpriseStore((s) => s.addPoi)
  const tourFocusNodeId = useEnterpriseStore((s) => s.tourFocusNodeId)
  const setTourFocusNodeId = useEnterpriseStore((s) => s.setTourFocusNodeId)

  const [mode, setMode] = useState('3d')
  const [showHeat, setShowHeat] = useState(true)
  const [showSpaghetti, setShowSpaghetti] = useState(true)
  const [showLegend, setShowLegend] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [constructor, setConstructor] = useState(false)
  const [draft, setDraft] = useState(null) // { pitch, yaw }
  const [form, setForm] = useState(EMPTY_POI)
  const viewerRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!enterprises.length) loadEnterprises()
  }, [enterprises.length, loadEnterprises])

  const enterprise = enterprises.find((e) => e.id === activeEnterpriseId) ?? enterprises[0] ?? null
  const rounds = useMemo(() => findRounds(enterprise), [enterprise])
  const workshop =
    enterprise?.workshops.find((w) => w.id === activeWorkshopId) ?? rounds.r1 ?? enterprise?.workshops[0] ?? null
  const takt = enterprise?.takt_time_sec || 120
  const isR2 = workshop && rounds.r2 && workshop.id === rounds.r2.id
  const nodes = workshop?.nodes ?? []
  const selected = nodes.find((n) => n.id === selectedId) ?? null
  const m1 = useMemo(() => routeMetrics(rounds.r1), [rounds.r1])
  const m2 = useMemo(() => routeMetrics(rounds.r2), [rounds.r2])

  // Фокус из Редактора («Показать в 3D»).
  useEffect(() => {
    if (!tourFocusNodeId) return
    const hit = nodes.find((n) => String(n.id) === String(tourFocusNodeId))
    if (hit) setSelectedId(hit.id)
    setTourFocusNodeId(null)
  }, [tourFocusNodeId, nodes, setTourFocusNodeId])

  const openEditor = (node) => {
    const vsm = useVsmStore.getState()
    vsm.setActiveWorkshop(`ws-${workshop.id}`)
    vsm.setSelectedNodeId(`n-${node.id}`)
    navigate('/editor')
  }

  // ---------- 360° ----------
  const panorama = assetUrl(workshop?.panorama_url)
  const pois = workshop?.pois ?? []

  const config = useMemo(
    () => ({
      default: { firstScene: 'workshop', autoLoad: true, showFullscreenCtrl: false },
      scenes: {
        workshop: {
          type: 'equirectangular',
          panorama,
          hfov: 95,
          minHfov: 50,
          maxHfov: 110,
          hotSpots: pois.map((p) => ({
            yaw: p.yaw,
            pitch: p.pitch,
            type: 'info',
            text: [p.title, p.metric_before && p.metric_after ? `${p.metric_before} → ${p.metric_after}` : '']
              .filter(Boolean)
              .join(' · '),
            cssClass: 'tour-hotspot',
          })),
        },
      },
    }),
    [panorama, pois],
  )

  const onReady = useCallback((viewer) => {
    viewerRef.current = viewer
  }, [])

  const onPanoClick = (event) => {
    if (!constructor || !viewerRef.current) return
    const [pitch, yaw] = viewerRef.current.mouseEventToCoords(event)
    setDraft({ pitch, yaw })
    setForm(EMPTY_POI)
  }

  const savePoi = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !draft) return
    await addPoi(workshop.id, {
      title: form.title.trim(),
      case_problem: form.case_problem || null,
      case_solution: form.case_solution || null,
      metric_before: form.metric_before || null,
      metric_after: form.metric_after || null,
      node_id: form.node_id === '' ? null : isNaN(Number(form.node_id)) ? form.node_id : Number(form.node_id),
      pitch: draft.pitch,
      yaw: draft.yaw,
    })
    setDraft(null)
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !workshop) return
    try {
      const vsm = useVsmStore.getState()
      vsm.setActiveWorkshop(`ws-${workshop.id}`)
      await vsm.uploadPanorama(file)
      await loadEnterprises()
    } catch {
      await setPanorama(workshop.id, file)
    }
  }

  if (!workshop) {
    return (
      <section className="tour-page">
        <div className="tour3d-empty">Загрузка предприятий…</div>
      </section>
    )
  }

  const field = (key) => ({
    value: form[key],
    onChange: (ev) => setForm((f) => ({ ...f, [key]: ev.target.value })),
  })

  return (
    <section className="tour-page tour3d-page" aria-label="Гибридный тур по цеху">
      <div className="tour3d-stage">
        {mode === '3d' ? (
          <Hall3D
            workshop={workshop}
            takt={takt}
            showHeat={showHeat}
            showSpaghetti={showSpaghetti}
            selectedId={selectedId}
            onSelect={(n) => setSelectedId(n?.id ?? null)}
          />
        ) : (
          <div
            className={`tour3d-pano${constructor ? ' is-constructor' : ''}`}
            onClickCapture={onPanoClick}
          >
            {workshop.panorama_url ? (
              <PannellumViewer config={config} onReady={onReady} className="tour-viewer" />
            ) : (
              <div className="tour3d-empty">Панорама не загружена</div>
            )}
          </div>
        )}
      </div>

      <div className="tour3d-toolbar">
        <div className="segmented">
          <button type="button" className={mode === '3d' ? 'is-active' : ''} onClick={() => setMode('3d')}>
            <Box size={14} /> 3D-двойник цеха
          </button>
          <button type="button" className={mode === '360' ? 'is-active' : ''} onClick={() => setMode('360')}>
            <Camera size={14} /> 360° Панорама
          </button>
        </div>
        <div className="segmented">
          <button
            type="button"
            className={!isR2 ? 'is-active' : ''}
            disabled={!rounds.r1}
            onClick={() => rounds.r1 && setActiveWorkshop(rounds.r1.id)}
          >
            Раунд 1
          </button>
          <button
            type="button"
            className={isR2 ? 'is-active' : ''}
            disabled={!rounds.r2}
            onClick={() => rounds.r2 && setActiveWorkshop(rounds.r2.id)}
          >
            Раунд 2
          </button>
        </div>
        {mode === '3d' ? (
          <>
            <button type="button" className={`btn${showHeat ? ' btn-primary' : ''}`} onClick={() => setShowHeat((v) => !v)}>
              <Flame size={14} /> Тепловая карта
            </button>
            <button
              type="button"
              className={`btn${showSpaghetti ? ' btn-primary' : ''}`}
              onClick={() => setShowSpaghetti((v) => !v)}
            >
              <RouteIcon size={14} /> Диаграмма спагетти
            </button>
            <button type="button" className="btn" onClick={() => setShowLegend((v) => !v)}>
              Легенда
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Загрузить панораму
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
            <button
              type="button"
              className={`btn${constructor ? ' btn-primary' : ''}`}
              onClick={() => {
                setConstructor((v) => !v)
                setDraft(null)
              }}
            >
              <Plus size={14} /> Режим конструктора POI
            </button>
          </>
        )}
      </div>

      {mode === '3d' && (
        <div className="tour3d-metrics">
          <h3>
            <ScanEye size={14} /> {workshop.name}
          </h3>
          <table>
            <thead>
              <tr>
                <th />
                <th>Раунд 1</th>
                <th>Раунд 2</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Путь логиста, м</td>
                <td>{m1.logistM}</td>
                <td>{rounds.r2 ? m2.logistM : '—'}</td>
              </tr>
              <tr>
                <td>Поток продукта, м</td>
                <td>{m1.flowM}</td>
                <td>{rounds.r2 ? m2.flowM : '—'}</td>
              </tr>
              <tr>
                <td>Всего, м</td>
                <td>{m1.totalM}</td>
                <td>{rounds.r2 ? m2.totalM : '—'}</td>
              </tr>
              <tr>
                <td>Транспорт, с</td>
                <td>{m1.transportSec}</td>
                <td>{rounds.r2 ? m2.transportSec : '—'}</td>
              </tr>
              <tr>
                <td>Рейсов логиста</td>
                <td>{m1.trips}</td>
                <td>{rounds.r2 ? m2.trips : '—'}</td>
              </tr>
            </tbody>
          </table>
          <small>Такт {Math.round(takt)} с</small>
        </div>
      )}

      {mode === '3d' && showLegend && showHeat && (
        <div className="tour3d-legend">
          {LEGEND.map((h, i) => (
            <span key={`${h.key}-${i}`}>
              <i style={{ background: h.color }} /> {h.label}
            </span>
          ))}
        </div>
      )}

      {mode === '3d' && (
        <XRayDrawer node={selected} takt={takt} onClose={() => setSelectedId(null)} onOpenEditor={openEditor} />
      )}

      {mode === '360' && (
        <div className="tour3d-poilist">
          <h3>
            <MapPin size={14} /> Точки интереса ({pois.length})
          </h3>
          {constructor && <p className="tour3d-hint">Кликните по панораме, чтобы поставить POI.</p>}
          <ul>
            {pois.map((p) => (
              <li
                key={p.id}
                onClick={() => viewerRef.current?.lookAt(p.pitch, p.yaw, 70, 800)}
              >
                <strong>{p.title}</strong>
                {p.metric_before && (
                  <small>
                    {p.metric_before} → {p.metric_after}
                  </small>
                )}
                {p.case_problem && <small>Проблема: {p.case_problem}</small>}
                {p.case_solution && <small>Решение: {p.case_solution}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === '360' && draft && (
        <form className="tour3d-poiform poi-form" onSubmit={savePoi}>
          <h3>Новая точка интереса</h3>
          <small>
            pitch {draft.pitch.toFixed(1)}° · yaw {draft.yaw.toFixed(1)}°
          </small>
          <input placeholder="Название" required {...field('title')} />
          <textarea placeholder="Проблема" rows={2} {...field('case_problem')} />
          <textarea placeholder="Решение" rows={2} {...field('case_solution')} />
          <input placeholder="Метрика до" {...field('metric_before')} />
          <input placeholder="Метрика после" {...field('metric_after')} />
          <select {...field('type')}>
            <option value="info">Информация</option>
            <option value="problem">Проблема</option>
            <option value="solution">Решение</option>
          </select>
          <select {...field('node_id')}>
            <option value="">— без привязки к этапу —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                №{n.step_number} {n.name}
              </option>
            ))}
          </select>
          <div className="tour3d-poiform__actions">
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">
              Сохранить
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
