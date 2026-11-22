import { Scale, RotateCcw, Box } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEnterpriseStore } from '../store/useEnterpriseStore'
import { bottleneckOf, findRounds, isOperational } from '../utils/metrics'
import './DashboardPage.css'

const fmt = (v, d = 0) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const rub = (v) => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))} ₽`
const kRub = (v) => `${fmt(Math.abs(v) / 1000, Math.abs(v) % 1000 ? 1 : 0)}к руб`
const REAL_ACCEPTED_R1 = 2

function stationRows(workshop, takt) {
  return (workshop?.nodes ?? [])
    .filter(isOperational)
    .sort((a, b) => a.step_number - b.step_number)
    .map((n) => ({ id: n.id, step: n.step_number, sec: n.cycle_time_sec, load: takt ? (n.cycle_time_sec / takt) * 100 : 0 }))
}

function scenario(ent, workshop, balanced) {
  const takt = ent.shift_duration_sec / (ent.target_output || 1)
  const maxCycle = bottleneckOf(workshop)?.cycle_time_sec ?? 0
  const capacity = maxCycle ? Math.floor(ent.shift_duration_sec / maxCycle) : 0
  const accepted = balanced ? Math.min(ent.target_output, capacity) : Math.min(REAL_ACCEPTED_R1, capacity)
  const totalCost = ent.cost_fot + ent.cost_equipment + ent.cost_overhead + ent.cost_materials
  const revenue = accepted * ent.unit_price
  const defect = balanced ? 0 : ent.defect_in_flow_cost
  return {
    takt, maxCycle, capacity, accepted, totalCost, revenue, defect,
    unitCost: accepted ? totalCost / accepted : null,
    profit: revenue - totalCost,
    profitDefect: revenue - totalCost - defect,
    fpy: balanced ? 100 : 33,
    wipEnd: balanced ? ent.wip_start_cost : ent.wip_end_cost,
  }
}

export default function DashboardPage() {
  const ent = useEnterpriseStore((s) => s.enterprises.find((e) => e.id === s.activeEnterpriseId) ?? null)
  const balanced = useEnterpriseStore((s) => !!s.balanced[s.activeEnterpriseId])
  // balanceLog выбираем по ссылке (стабильно), а нужный массив вычисляем во время рендера.
  // Возврат `[...] ?? []` прямо из селектора даёт новую ссылку на каждый вызов
  // и приводит к бесконечным ре-рендерам через useSyncExternalStore (React 18/19 + Zustand v5).
  const balanceLog = useEnterpriseStore((s) => s.balanceLog)
  const log = balanceLog[ent?.id] ?? []
  const baseline = useEnterpriseStore((s) => s.originalBaseline[s.activeEnterpriseId])
  const { loadEnterprises, autoBalance, resetBalance, updateEnterpriseParams, fetchAutobalancePreview } = useEnterpriseStore.getState()

  useEffect(() => {
    if (!useEnterpriseStore.getState().enterprises.length) loadEnterprises()
  }, [loadEnterprises])

  const { r1 } = findRounds(ent)
  const before = useMemo(() => {
    if (!ent || !r1) return null
    return scenario(ent, balanced && baseline ? baseline : r1, false)
  }, [ent, r1, balanced, baseline])
  const after = useMemo(() => {
    if (!ent || !r1) return null
    return scenario(ent, r1, true)
  }, [ent, r1])

  if (!ent || !r1 || !before) {
    return <div className="page dashboard-page"><p className="ent-muted">Загрузка предприятия…</p></div>
  }

  const takt = before.takt
  const baseRows = stationRows(balanced && baseline ? baseline : r1, takt)
  const rows = stationRows(r1, takt)
  const cur = balanced ? after : before
  const maxSec = Math.max(takt * 1.6, ...baseRows.map((r) => r.sec), ...rows.map((r) => r.sec))
  const pct = (sec) => `${(sec / maxSec) * 100}%`
  const deltaOf = (id) => {
    const b = baseRows.find((r) => r.id === id)?.sec ?? 0
    const a = rows.find((r) => r.id === id)?.sec ?? 0
    return a - b
  }
  const bn = baseRows.reduce((m, r) => (r.sec > m.sec ? r : m), baseRows[0])
  const bnNow = rows.reduce((m, r) => (r.sec > m.sec ? r : m), rows[0])

  const onBalance = () => {
    autoBalance()
    fetchAutobalancePreview()
  }
  const setParam = (key, v) => {
    const n = Number(v)
    if (n > 0) updateEnterpriseParams({ [key]: n })
  }

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Цифровой Инфоцентр РЦК</span>
          <h1 className="page-title">{ent.name}</h1>
          <p className="page-subtitle">
            Смена {fmt(ent.shift_duration_sec)} сек · План {ent.target_output} шт · Такт {fmt(takt)} сек ·{' '}
            {balanced ? 'Раунд 2 — сбалансированный поток («После»)' : 'Раунд 1 — «Как есть» («До»)'}
          </p>
        </div>
      </header>

      <section className="info-board" aria-label="Инфоцентр РЦК">
        <article className="info-col c-safety">
          <h3>Безопасность</h3>
          <b className="info-big">0</b>
          <span>травм / нарушений ОТ (0 инцидентов)</span>
          <small>5S: лишние предметы на столах — см. 3D-цех</small>
        </article>
        <article className="info-col c-quality">
          <h3>Качество</h3>
          <b className="info-big">{cur.fpy}%</b>
          <span>выход годных с первого предъявления (FPY)</span>
          <small>
            Принято заказчиком: {cur.accepted} шт · Брак в потоке: {rub(cur.defect)}
            {balanced ? '' : ' → цель 95–100%'}
          </small>
        </article>
        <article className="info-col c-delivery">
          <h3>Поток и Такт</h3>
          <b className="info-big">{fmt(takt)} сек</b>
          <span>
            Узкое место: Оператор №{bnNow.step} — {fmt(bnNow.sec)} сек ({fmt(bnNow.load, 1)}%)
          </span>
          <small>
            Потолок: floor({fmt(ent.shift_duration_sec)}/{fmt(cur.maxCycle)}) = {cur.capacity} шт из плана {ent.target_output}; сдано {cur.accepted} шт
          </small>
        </article>
        <article className="info-col c-cost">
          <h3>Затраты</h3>
          <b className="info-big">{kRub(cur.totalCost)}</b>
          <span>{rub(cur.totalCost)} за смену</span>
          <small>
            Себестоимость 1 ед.: {cur.unitCost ? `${kRub(cur.unitCost)} (${rub(cur.unitCost)})` : '—'}
          </small>
        </article>
        <article className="info-col c-wip">
          <h3>НЗП / Запасы</h3>
          <b className="info-big">
            {fmt(ent.wip_start_cost / 1000, 1)}к → {fmt(cur.wipEnd / 1000, cur.wipEnd % 1000 ? 1 : 0)}к
          </b>
          <span>НЗП: {kRub(ent.wip_start_cost)} → {kRub(cur.wipEnd)}</span>
          <small>
            Заморожено {rub(cur.wipEnd - ent.wip_start_cost)} (партии по 2 шт){balanced ? ' — единичный поток' : ''}
          </small>
        </article>
      </section>

      <section className="viz-card dash-card">
        <div className="dash-head">
          <div>
            <h2 className="viz-title">Диаграмма Ямадзуми — загрузка операторов 1–10</h2>
            <p className="viz-subtitle">Красная пунктирная линия — такт {fmt(takt)} сек (100%).</p>
          </div>
          <div className="dash-actions">
            {!balanced ? (
              <button type="button" className="btn btn--primary" onClick={onBalance}>
                <Scale size={15} aria-hidden="true" /> Автобалансировка потока
              </button>
            ) : (
              <button type="button" className="btn" onClick={resetBalance}>
                <RotateCcw size={15} aria-hidden="true" /> Сбросить к исходному (Раунд 1)
              </button>
            )}
            <Link to="/tour" className="btn"><Box size={15} aria-hidden="true" /> Проверить в 3D-цехе</Link>
          </div>
        </div>

        <div className="yama">
          <div className="yama-plot">
            <div className="yama-takt" style={{ bottom: pct(takt) }}>
              <span>Такт {fmt(takt)} сек</span>
            </div>
          </div>
          {rows.map((r) => {
            const d = deltaOf(r.id)
            const over = r.sec > takt
            const color = over ? 'over' : r.load >= 85 ? 'warn' : r.load < 50 ? 'under' : 'ok'
            return (
              <div className="yama-col" key={r.id}>
                <span className="yama-delta">{d !== 0 ? `${d > 0 ? '+' : '−'}${Math.abs(d)} сек` : ''}</span>
                <span className="yama-val">{fmt(r.sec)} с · {fmt(r.load, 1)}%</span>
                <div className="yama-track">
                  <div className={`yama-bar is-${color}`} style={{ height: pct(r.sec) }} />
                </div>
                <span className="yama-name">Оп. №{r.step}{r.step === 10 ? ' ОТК' : ''}</span>
              </div>
            )
          })}
        </div>

        {balanced && (
          <div className="protocol">
            <h3>Протокол перераспределения операций</h3>
            <ul>
              {log.map((m, i) => (
                <li key={i}>
                  Оператор №{m.fromStep} → Оператор №{m.toStep}: <b>{m.sec} сек</b>
                </li>
              ))}
            </ul>
            <p>
              Оператор №{bn.step}: {fmt(bn.sec)} сек ({fmt(bn.load, 1)}%) → {fmt(rows.find((r) => r.step === bn.step)?.sec)} сек (
              {fmt(rows.find((r) => r.step === bn.step)?.load, 1)}%). Все 10 столов ≤ {fmt(takt)} сек. Узкое место теперь: Оператор №
              {bnNow.step} — {fmt(bnNow.sec)} сек ({fmt(bnNow.load, 1)}%).
            </p>
          </div>
        )}
      </section>

      <section className="viz-card dash-card">
        <h2 className="viz-title">Финансовая модель смены: «До» и «После»</h2>
        <div className="fin-params">
          <label>Смена, сек<input type="number" min="1" value={ent.shift_duration_sec} onChange={(e) => setParam('shift_duration_sec', e.target.value)} /></label>
          <label>План, шт<input type="number" min="1" value={ent.target_output} onChange={(e) => setParam('target_output', e.target.value)} /></label>
          <label>Цена изделия, ₽<input type="number" min="1" value={ent.unit_price} onChange={(e) => setParam('unit_price', e.target.value)} /></label>
          <span className="fin-formula">Такт = {fmt(ent.shift_duration_sec)} / {ent.target_output} = {fmt(takt)} сек</span>
        </div>
        <div className="fin-grid">
          {[['До (Раунд 1 — Как есть)', before, 'is-before'], ['После (Сбалансированный поток)', after, 'is-after']].map(([title, s, cls]) => (
            <div className={`fin-card ${cls}`} key={title}>
              <h3>{title}</h3>
              <dl>
                <dt>Узкое место</dt><dd>{fmt(s.maxCycle)} сек → макс. {s.capacity} шт</dd>
                <dt>Принято</dt><dd>{s.accepted} шт</dd>
                <dt>Выручка</dt><dd>{s.accepted} × {fmt(ent.unit_price)} = {rub(s.revenue)}</dd>
                <dt>ФОТ</dt><dd>{rub(ent.cost_fot)}</dd>
                <dt>Оборудование и площади</dt><dd>{rub(ent.cost_equipment)}</dd>
                <dt>Накладные</dt><dd>{rub(ent.cost_overhead)}</dd>
                <dt>Материалы</dt><dd>{rub(ent.cost_materials)}</dd>
                <dt>Итого затраты</dt><dd>{rub(s.totalCost)}</dd>
                <dt>Себестоимость ед.</dt><dd>{s.unitCost ? rub(s.unitCost) : '—'}</dd>
                <dt>Потери на браке</dt><dd>{rub(s.defect)}</dd>
                <dt>Финансовый результат</dt>
                <dd className={s.profit < 0 ? 'neg' : 'pos'}>
                  {s.profit >= 0 ? '+' : ''}{rub(s.profit)}
                  {s.defect ? ` (${rub(s.profitDefect)} с браком)` : ''}
                </dd>
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
