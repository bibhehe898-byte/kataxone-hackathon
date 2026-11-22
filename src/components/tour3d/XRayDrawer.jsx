import { X } from 'lucide-react'
import { heatInfo } from '../../utils/metrics'

const List = ({ title, items }) =>
  items?.length ? (
    <div className="xray-block">
      <h4>{title}</h4>
      <ul>
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  ) : null

export default function XRayDrawer({ node, takt, onClose, onOpenEditor }) {
  if (!node) return null
  const load = node.load_percent ?? (node.cycle_time_sec / takt) * 100
  const heat = heatInfo(load)
  return (
    <aside className="xray-drawer">
      <button type="button" className="xray-close" onClick={onClose} aria-label="Закрыть">
        <X size={16} />
      </button>
      <span className="page-eyebrow">Рентген рабочего места</span>
      <h2>
        №{node.step_number} · {node.name}
      </h2>
      <div className="xray-kpi">
        <div>
          <small>Цикл</small>
          <b>{Math.round(node.cycle_time_sec)} с</b>
        </div>
        <div>
          <small>Такт</small>
          <b>{Math.round(takt)} с</b>
        </div>
        <div style={{ color: heat.color }}>
          <small>Загрузка</small>
          <b>{Math.round(load)}%</b>
        </div>
      </div>
      <div className="xray-bar">
        <i style={{ width: `${Math.min(100, load)}%`, background: heat.color }} />
      </div>
      {node.is_bottleneck && <p className="xray-warn">Узкое место потока</p>}
      <List title="Стандартные шаги" items={node.standard_steps} />
      <List title="Комплектующие" items={node.components} />
      <List title="Инструмент" items={node.tools_required} />
      <List title="Лишнее (5S)" items={node.excess_items_5s} />
      <button type="button" className="btn btn-primary" onClick={() => onOpenEditor(node)}>
        Перейти к этапу в Редакторе КПСЦ
      </button>
    </aside>
  )
}
