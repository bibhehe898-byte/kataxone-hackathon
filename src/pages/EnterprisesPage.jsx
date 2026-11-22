import { Building2, ChartColumn, Compass, Download, Factory, Plus, Trash2, Upload, Workflow, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEnterpriseStore } from '../store/useEnterpriseStore'
import { bottleneckOf, findRounds } from '../utils/metrics'
import './EnterprisesPage.css'

const EMPTY_FORM = {
  name: '', industry: '', product_name: '', workshop_name: 'Основной цех',
  shift_duration_sec: 1200, target_output: 10, unit_price: 70000,
  cost_fot: 160000, cost_equipment: 153000, cost_overhead: 200000, cost_materials: 60000,
  defect_in_flow_cost: 15000, wip_start_cost: 71500, wip_end_cost: 74000,
  width_m: 6.15, length_m: 18.4,
}

const FIELDS = [
  ['name', 'Название предприятия', 'text'], ['industry', 'Отрасль', 'text'], ['product_name', 'Изделие', 'text'],
  ['workshop_name', 'Название цеха', 'text'], ['width_m', 'Ширина цеха, м', 'number'], ['length_m', 'Длина цеха, м', 'number'],
  ['shift_duration_sec', 'Длительность смены, сек', 'number'], ['target_output', 'План выпуска, шт.', 'number'],
  ['unit_price', 'Цена изделия, ₽', 'number'], ['cost_fot', 'ФОТ, ₽', 'number'],
  ['cost_equipment', 'Оборудование и аренда, ₽', 'number'], ['cost_overhead', 'Общехозяйственные, ₽', 'number'],
  ['cost_materials', 'Материалы, ₽', 'number'], ['defect_in_flow_cost', 'Брак в потоке, ₽', 'number'],
  ['wip_start_cost', 'НЗП на начало, ₽', 'number'], ['wip_end_cost', 'НЗП на конец, ₽', 'number'],
]

function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function EnterprisesPage() {
  const navigate = useNavigate()
  const { enterprises, online, loading, activeEnterpriseId } = useEnterpriseStore()
  const loadEnterprises = useEnterpriseStore((s) => s.loadEnterprises)
  const selectEnterprise = useEnterpriseStore((s) => s.selectEnterprise)
  const createEnterprise = useEnterpriseStore((s) => s.createEnterprise)
  const importEnterprise = useEnterpriseStore((s) => s.importEnterprise)
  const exportEnterprise = useEnterpriseStore((s) => s.exportEnterprise)
  const deleteEnterprise = useEnterpriseStore((s) => s.deleteEnterprise)
  const [wizard, setWizard] = useState(null)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    loadEnterprises()
  }, [loadEnterprises])

  const open = (id, path) => {
    selectEnterprise(id)
    navigate(path)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!wizard.name.trim()) return
    await createEnterprise(wizard)
    setWizard(null)
  }

  const onImport = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      await importEnterprise(JSON.parse(await file.text()))
      setError('')
    } catch {
      setError('Не удалось импортировать JSON: неверный формат файла')
    }
  }

  const onExport = async (ent) => {
    download(`enterprise-${ent.id}.json`, await exportEnterprise(ent.id))
  }

  return (
    <div className="page enterprises-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow"><Building2 size={14} aria-hidden="true" /> Мои предприятия</span>
          <h1 className="page-title">Выберите предприятие</h1>
          <p className="page-subtitle">
            Цифровые двойники производств.{' '}
            <span className={`ent-conn ${online ? 'is-online' : ''}`}>
              {online ? 'Подключено к серверу (127.0.0.1:8000)' : 'Офлайн-режим: локальные данные VENIO-C'}
            </span>
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={15} aria-hidden="true" /> Импорт из JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
          <button type="button" className="btn btn--primary" onClick={() => setWizard({ ...EMPTY_FORM })}>
            <Plus size={16} aria-hidden="true" /> Создать новое предприятие
          </button>
        </div>
      </header>
      {error && <p className="ent-error">{error}</p>}
      {loading && <p className="ent-muted">Загрузка…</p>}

      <div className="ent-grid">
        {enterprises.map((ent) => {
          const { r1 } = findRounds(ent)
          const bn = bottleneckOf(r1)
          const ops = r1?.nodes.filter((n) => n.kind === 'operation' || n.kind === 'control').length ?? 0
          return (
            <article key={ent.id} className={`ent-card${ent.id === activeEnterpriseId ? ' is-active' : ''}`}>
              <div className="ent-card__head">
                <span className="ent-card__icon"><Factory size={20} aria-hidden="true" /></span>
                <div>
                  <h2>{ent.name}</h2>
                  <small>{ent.industry || 'Отрасль не указана'}</small>
                </div>
              </div>
              <p className="ent-card__product">{ent.product_name}</p>
              <dl className="ent-kpis">
                <div><dt>Такт</dt><dd>{Math.round(ent.takt_time_sec)} с</dd></div>
                <div><dt>Цехов</dt><dd>{ent.workshops.length}</dd></div>
                <div><dt>Рабочих мест</dt><dd>{ops}</dd></div>
                <div className={bn && bn.load_percent > 100 ? 'is-bad' : ''}>
                  <dt>Узкое место</dt>
                  <dd>{bn ? `Оп. ${bn.step_number} — ${bn.cycle_time_sec} с / ${bn.load_percent}%` : '—'}</dd>
                </div>
              </dl>
              <div className="ent-card__actions">
                <button type="button" className="btn btn--primary" onClick={() => open(ent.id, '/tour')}>
                  <Compass size={15} aria-hidden="true" /> 3D / 360° тур
                </button>
                <button type="button" className="btn" onClick={() => open(ent.id, '/editor')}>
                  <Workflow size={15} aria-hidden="true" /> Редактор КПСЦ
                </button>
                <button type="button" className="btn" onClick={() => open(ent.id, '/dashboard')}>
                  <ChartColumn size={15} aria-hidden="true" /> Дашборд
                </button>
                <button type="button" className="btn" onClick={() => onExport(ent)} title="Экспорт JSON">
                  <Download size={15} aria-hidden="true" /> Экспорт JSON
                </button>
                {ent.id !== activeEnterpriseId || enterprises.length > 1 ? (
                  <button
                    type="button"
                    className="btn"
                    aria-label="Удалить предприятие"
                    onClick={() => window.confirm(`Удалить «${ent.name}»?`) && deleteEnterprise(ent.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {wizard && (
        <div className="ent-overlay" onClick={() => setWizard(null)}>
          <form className="ent-wizard" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="ent-wizard__head">
              <h2>Новое предприятие</h2>
              <button type="button" className="ent-x" onClick={() => setWizard(null)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className="ent-wizard__grid">
              {FIELDS.map(([key, label, type]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type={type}
                    step="any"
                    required={key === 'name'}
                    value={wizard[key]}
                    onChange={(e) => setWizard((w) => ({ ...w, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <p className="ent-muted">
              Такт = {Math.round((Number(wizard.shift_duration_sec) || 0) / (Number(wizard.target_output) || 1))} с.
              Будет создан цех с тремя операциями — их можно изменить в редакторе.
            </p>
            <div className="ent-wizard__foot">
              <button type="button" className="btn" onClick={() => setWizard(null)}>Отмена</button>
              <button type="submit" className="btn btn--primary">Создать</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
