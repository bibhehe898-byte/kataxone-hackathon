import { Clock, Gauge, Timer, Wallet } from 'lucide-react'
import { Handle, Position } from '@xyflow/react'
import { heatInfo } from '../utils/metrics'

const KIND_LABELS = {
  operation: 'Операция',
  office: 'Офис',
  control: 'Контроль',
}

export default function VsmNode({ data, selected }) {
  const isBottleneck = data.bottleneck ?? (data.load ?? 0) > 90
  const heat = heatInfo(data.load ?? 0)
  // Зелёная рамка при нормальной загрузке (после автобалансировки N8 = 80%).
  const heatStyle = isBottleneck || heat.key !== 'ok' ? undefined : { borderColor: heat.color, boxShadow: `0 0 0 1px ${heat.color}55` }

  return (
    <div
      style={heatStyle}
      className={`vsm-node vsm-node--${data.kind ?? 'operation'}${selected ? ' is-selected' : ''}${isBottleneck ? ' is-bottleneck' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="vsm-handle" />
      <span className="vsm-node__kind">{KIND_LABELS[data.kind] ?? 'Операция'}</span>
      <strong className="vsm-node__label">{data.label}</strong>
      <div className="vsm-node__metrics">
        <span title="Время цикла">
          <Timer size={11} aria-hidden="true" />
          CT {data.cycleTime} с
        </span>
        <span title="Время протекания">
          <Clock size={11} aria-hidden="true" />
          LT {data.leadTime} с
        </span>
        <span title="Загрузка">
          <Gauge size={11} aria-hidden="true" />
          Загрузка {data.load}%
        </span>
        <span title="Стоимость">
          <Wallet size={11} aria-hidden="true" />
          {data.cost ?? 0} ₽
        </span>
      </div>
      {isBottleneck && (
        <span className="vsm-node__bottleneck-badge">
          ⚠️ {data.load}% (Узкое место)
        </span>
      )}
      <Handle type="source" position={Position.Right} className="vsm-handle" />
    </div>
  )
}
