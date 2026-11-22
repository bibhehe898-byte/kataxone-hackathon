import { MarkerType } from '@xyflow/react'

const EDGE_DEFAULTS = {
  type: 'smoothstep',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 15,
    height: 15,
    color: 'rgba(148, 178, 204, 0.55)',
  },
  style: { stroke: 'rgba(148, 178, 204, 0.42)', strokeWidth: 1.6 },
}

export const createEdge = (source, target) => ({
  id: `e-${source}-${target}`,
  source,
  target,
  ...EDGE_DEFAULTS,
})

const node = (id, x, data) => {
  const cycleTime = data.cycleTime ?? 0
  return {
    id,
    type: 'vsm',
    position: { x, y: 150 },
    data: { cycleTime: 0, leadTime: cycleTime, cost: 0, kind: 'operation', ...data },
  }
}

export const FLOW_META = {
  before: {
    title: 'Как есть',
    subtitle: 'Текущий поток — 6 этапов · узкое место: сборка мембранного узла (95%)',
  },
  after: {
    title: 'Как будет',
    subtitle: 'Целевой поток — 6 этапов · загрузка мембранного узла снижена до 70%',
  },
}

export const initialBeforeFlow = {
  nodes: [
    node('assembly_pilot', 20, {
      label: 'Сборка узла пилота',
      kind: 'operation',
      cycleTime: 4,
      load: 60,
      cost: 250,
    }),
    node('assembly_membrane', 270, {
      label: 'Сборка мембранного узла',
      kind: 'operation',
      cycleTime: 12,
      load: 95,
      cost: 500,
      bottleneck: true,
    }),
    node('assembly_regulator', 520, {
      label: 'Сборка регулятора',
      kind: 'operation',
      cycleTime: 5,
      load: 70,
      cost: 300,
    }),
    node('fittings', 770, {
      label: 'Установка фитингов',
      kind: 'operation',
      cycleTime: 3,
      load: 50,
      cost: 150,
    }),
    node('qc_check', 1020, {
      label: 'Контроль качества ОТК',
      kind: 'control',
      cycleTime: 2,
      load: 40,
      cost: 100,
    }),
    node('packaging', 1270, {
      label: 'Упаковка',
      kind: 'operation',
      cycleTime: 2,
      load: 45,
      cost: 200,
    }),
  ],
  edges: [
    createEdge('assembly_pilot', 'assembly_membrane'),
    createEdge('assembly_membrane', 'assembly_regulator'),
    createEdge('assembly_regulator', 'fittings'),
    createEdge('fittings', 'qc_check'),
    createEdge('qc_check', 'packaging'),
  ],
}

export const initialAfterFlow = {
  nodes: [
    node('assembly_pilot', 20, {
      label: 'Сборка узла пилота',
      kind: 'operation',
      cycleTime: 4,
      load: 60,
      cost: 250,
    }),
    node('assembly_membrane', 270, {
      label: 'Сборка мембранного узла',
      kind: 'operation',
      cycleTime: 6,
      load: 70,
      cost: 500,
    }),
    node('assembly_regulator', 520, {
      label: 'Сборка регулятора',
      kind: 'operation',
      cycleTime: 5,
      load: 70,
      cost: 300,
    }),
    node('fittings', 770, {
      label: 'Установка фитингов',
      kind: 'operation',
      cycleTime: 3,
      load: 50,
      cost: 150,
    }),
    node('qc_check', 1020, {
      label: 'Контроль качества ОТК',
      kind: 'control',
      cycleTime: 2,
      load: 40,
      cost: 100,
    }),
    node('packaging', 1270, {
      label: 'Упаковка',
      kind: 'operation',
      cycleTime: 2,
      load: 45,
      cost: 200,
    }),
  ],
  edges: [
    createEdge('assembly_pilot', 'assembly_membrane'),
    createEdge('assembly_membrane', 'assembly_regulator'),
    createEdge('assembly_regulator', 'fittings'),
    createEdge('fittings', 'qc_check'),
    createEdge('qc_check', 'packaging'),
  ],
}

/**
 * Сводные показатели для дашборда считаются из текущего состояния
 * потоков в store, чтобы правки в редакторе сразу отражались.
 */
export const DASHBOARD_METRICS = [
  {
    key: 'steps',
    label: 'Количество этапов',
    unit: 'шт.',
    direction: 'lower',
    decimals: 0,
    value: (flow) => flow.nodes.length,
  },
  {
    key: 'leadTime',
    label: 'Время протекания',
    unit: 'ч',
    direction: 'lower',
    decimals: 0,
    value: (flow) => flow.nodes.reduce((sum, item) => sum + (item.data.leadTime ?? 0), 0),
  },
  {
    key: 'cycleTime',
    label: 'Суммарное время цикла',
    unit: 'мин',
    direction: 'lower',
    decimals: 0,
    value: (flow) => flow.nodes.reduce((sum, item) => sum + (item.data.cycleTime ?? 0), 0),
  },
  {
    key: 'vaRatio',
    label: 'Доля добавленной ценности',
    unit: '%',
    direction: 'higher',
    decimals: 1,
    value: (flow) => {
      const cycleTime = flow.nodes.reduce((sum, item) => sum + (item.data.cycleTime ?? 0), 0)
      const leadTime = flow.nodes.reduce((sum, item) => sum + (item.data.leadTime ?? 0), 0)
      return leadTime > 0 ? (cycleTime / (leadTime * 60)) * 100 : 0
    },
  },
]
