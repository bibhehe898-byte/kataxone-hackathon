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
    subtitle: 'Раунд 1 — 10 этапов · узкое место: Установка 6 болтов (142.5%)',
  },
  after: {
    title: 'Как будет',
    subtitle: 'Раунд 2 — 10 этапов · узкое место: Сборка пульта (85%)',
  },
}

export const initialBeforeFlow = {
  nodes: [
    node('n1', 20, {
      label: 'Сборка корпуса пилота и крышки нижней',
      kind: 'operation',
      cycleTime: 81,
      load: 67.5,
    }),
    node('n2', 270, {
      label: 'Сборка корпуса управления и крышки верхней',
      kind: 'operation',
      cycleTime: 66,
      load: 55.0,
    }),
    node('n3', 520, {
      label: 'Сборка дросселя',
      kind: 'operation',
      cycleTime: 13,
      load: 10.8,
    }),
    node('n4', 770, {
      label: 'Установка тарелки и дросселя',
      kind: 'operation',
      cycleTime: 61,
      load: 50.8,
    }),
    node('n5', 1020, {
      label: 'Сборка мембраны',
      kind: 'operation',
      cycleTime: 35,
      load: 29.2,
    }),
    node('n6', 1270, {
      label: 'Сборка пробки',
      kind: 'operation',
      cycleTime: 39,
      load: 32.5,
    }),
    node('n7', 1520, {
      label: 'Сборка пульта управления',
      kind: 'operation',
      cycleTime: 102,
      load: 85.0,
    }),
    node('n8', 1770, {
      label: 'Установка 6 болтов в пульт управления',
      kind: 'operation',
      cycleTime: 171,
      load: 142.5,
      bottleneck: true
    }),
    node('n9', 2020, {
      label: 'Установка штуцеров и патрубка в корпус пилота',
      kind: 'operation',
      cycleTime: 82,
      load: 68.3,
    }),
    node('n10', 2270, {
      label: 'Контрольная операция (ОТК)',
      kind: 'control',
      cycleTime: 22,
      load: 18.3,
    }),
  ],
  edges: [
    createEdge('n1', 'n2'),
    createEdge('n2', 'n3'),
    createEdge('n3', 'n4'),
    createEdge('n4', 'n5'),
    createEdge('n5', 'n6'),
    createEdge('n6', 'n7'),
    createEdge('n7', 'n8'),
    createEdge('n8', 'n9'),
    createEdge('n9', 'n10'),
  ],
}

export const initialAfterFlow = {
  nodes: [
    node('n1', 20, {
      label: 'Сборка корпуса пилота и крышки нижней',
      kind: 'operation',
      cycleTime: 84,
      load: 70.0,
    }),
    node('n2', 270, {
      label: 'Сборка корпуса управления и крышки верхней',
      kind: 'operation',
      cycleTime: 68,
      load: 56.7,
    }),
    node('n3', 520, {
      label: 'Сборка дросселя',
      kind: 'operation',
      cycleTime: 56,
      load: 46.7,
    }),
    node('n4', 770, {
      label: 'Установка тарелки и дросселя',
      kind: 'operation',
      cycleTime: 72,
      load: 60.0,
    }),
    node('n5', 1020, {
      label: 'Сборка мембраны',
      kind: 'operation',
      cycleTime: 88,
      load: 73.3,
    }),
    node('n6', 1270, {
      label: 'Сборка пробки',
      kind: 'operation',
      cycleTime: 54,
      load: 45.0,
    }),
    node('n7', 1520, {
      label: 'Сборка пульта управления',
      kind: 'operation',
      cycleTime: 102,
      load: 85.0,
      bottleneck: true
    }),
    node('n8', 1770, {
      label: 'Установка 6 болтов в пульт управления',
      kind: 'operation',
      cycleTime: 96,
      load: 80.0,
    }),
    node('n9', 2020, {
      label: 'Установка штуцеров и патрубка в корпус пилота',
      kind: 'operation',
      cycleTime: 82,
      load: 68.3,
    }),
    node('n10', 2270, {
      label: 'Контрольная операция (ОТК)',
      kind: 'control',
      cycleTime: 22,
      load: 18.3,
    }),
  ],
  edges: [
    createEdge('n1', 'n2'),
    createEdge('n2', 'n3'),
    createEdge('n3', 'n4'),
    createEdge('n4', 'n5'),
    createEdge('n5', 'n6'),
    createEdge('n6', 'n7'),
    createEdge('n7', 'n8'),
    createEdge('n8', 'n9'),
    createEdge('n9', 'n10'),
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
