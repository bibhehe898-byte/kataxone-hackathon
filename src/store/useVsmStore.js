import { addEdge, applyEdgeChanges, applyNodeChanges, MarkerType } from 'reactflow'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './useAuthStore'

const API_URL = 'http://127.0.0.1:8000'

/**
 * Приводит путь, полученный от бэкенда, к абсолютному URL.
 * '/static/uploads/x.jpg' -> 'http://127.0.0.1:8000/static/uploads/x.jpg'
 * Легаси '/uploads/x.jpg' бэкенд отдаёт по '/static/uploads/x.jpg'.
 * Абсолютные / data: / blob: URL не трогаем.
 */
const resolveBackendUrl = (url) => {
  if (typeof url !== 'string' || !url) return url
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^(data|blob):/i.test(url)) return url
  const path = url.startsWith('/uploads/') ? `/static${url}` : url
  return path.startsWith('/') ? `${API_URL}${path}` : path
}

const cloneFlow = (flow) => structuredClone(flow)

const generateWorkshopId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `w-${crypto.randomUUID()}`
  }
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// Локальная замена удаленной функции из vsmData.js
const NEW_EDGE_DEFAULTS = {
  type: 'smoothstep',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 15,
    height: 15,
    color: 'rgba(148, 178, 204, 0.55)',
  },
  style: { stroke: 'rgba(148, 178, 204, 0.42)', strokeWidth: 1.6 },
}

const createEdge = (source, target) => ({
  id: `e-${source}-${target}-${Math.random().toString(36).slice(2, 7)}`,
  source,
  target,
  ...NEW_EDGE_DEFAULTS,
})

// Начальные цеха теперь пустые, так как данные приходят с сервера
const INITIAL_WORKSHOPS = [
  {
    id: 'w1',
    name: 'Цех 1 (Текущий)',
    nodes: [],
    edges: [],
  },
  {
    id: 'w2',
    name: 'Цех 2 (Целевой)',
    nodes: [],
    edges: [],
  },
]

const defaultForWorkshop = () => {
  return { nodes: [], edges: [] }
}

const updateActiveWorkshop = (state, updater) => {
  // Защита: если activeWorkshopId не найден среди цехов (например, undefined),
  // возвращаем тот же state — zustand увидит ту же ссылку и ничего не изменит.
  const activeExists = state.workshops.some((workshop) => workshop.id === state.activeWorkshopId)
  if (!activeExists) return state
  return {
    workshops: state.workshops.map((workshop) =>
      workshop.id === state.activeWorkshopId ? updater(workshop) : workshop,
    ),
  }
}

export const useVsmStore = create(persist((set, get) => ({
  workshops: INITIAL_WORKSHOPS,
  activeWorkshopId: 'w1',
  selectedNodeId: null,

  setActiveWorkshop: (id) => {
    // Защита: не даём activeWorkshopId стать undefined/null/"".
    if (!id) return
    return set({ activeWorkshopId: id })
  },
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  // Синхронизация с активным предприятием (useEnterpriseStore): цеха и этапы VENIO-C
  // отображаются в Редакторе КПСЦ. id узлов: `n-<id>`, id цехов: `ws-<id>`.
  syncFromEnterprise: (enterprise) => {
    if (!enterprise?.workshops?.length) return
    const takt = enterprise.takt_time_sec || 120
    const workshops = enterprise.workshops.map((ws) => {
      const ops = ws.nodes
        .filter((n) => n.kind === 'operation' || n.kind === 'control')
        .sort((a, b) => a.step_number - b.step_number)
      const nodes = ops.map((n, i) => ({
        id: `n-${n.id}`,
        type: 'vsm',
        position: { x: 20 + (i % 5) * 270, y: 60 + Math.floor(i / 5) * 230 },
        data: {
          label: n.name.replace(/^Оператор №\d+:\s*/, `№${n.step_number} `),
          kind: n.kind,
          cycleTime: n.cycle_time_sec,
          leadTime: n.cycle_time_sec,
          load: Math.round((n.cycle_time_sec / takt) * 100),
          cost: 0,
          bottleneck: n.is_bottleneck,
        },
      }))
      const edges = nodes.slice(1).map((n, i) => createEdge(nodes[i].id, n.id))
      return { id: `ws-${ws.id}`, name: ws.name, nodes, edges }
    })
    set((state) => {
      const keep = workshops.some((w) => w.id === state.activeWorkshopId)
      return { workshops, activeWorkshopId: keep ? state.activeWorkshopId : workshops[0].id }
    })
  },

  addWorkshop: (name) =>
    set((state) => {
      const finalName = (name ?? '').trim() || `Цех ${state.workshops.length + 1}`

      const existingIds = new Set(state.workshops.map((workshop) => workshop.id))
      let id = generateWorkshopId()
      while (existingIds.has(id)) {
        id = generateWorkshopId()
      }

      const workshop = {
        id,
        name: finalName,
        nodes: [],
        edges: [],
      }

      return {
        workshops: [...state.workshops, workshop],
        activeWorkshopId: id,
      }
    }),

  deleteWorkshop: (id) =>
    set((state) => {
      if (state.workshops.length <= 1) return state

      const workshops = state.workshops.filter((workshop) => workshop.id !== id)
      if (workshops.length === state.workshops.length) return state

      return {
        workshops,
        activeWorkshopId:
          state.activeWorkshopId === id ? workshops[0]?.id : state.activeWorkshopId,
      }
    }),

  onNodesChange: (changes) =>
    set((state) =>
      updateActiveWorkshop(state, (workshop) => ({
        ...workshop,
        nodes: applyNodeChanges(changes, workshop.nodes),
      })),
    ),

  onEdgesChange: (changes) =>
    set((state) =>
      updateActiveWorkshop(state, (workshop) => ({
        ...workshop,
        edges: applyEdgeChanges(changes, workshop.edges),
      })),
    ),

  onConnect: (connection) =>
    set((state) =>
      updateActiveWorkshop(state, (workshop) => ({
        ...workshop,
        edges: addEdge({ ...connection, ...NEW_EDGE_DEFAULTS }, workshop.edges),
      })),
    ),

  updateNode: (id, patch) =>
    set((state) =>
      updateActiveWorkshop(state, (workshop) => ({
        ...workshop,
        nodes: workshop.nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      })),
    ),

  updateNodeInWorkshop: (workshopId, nodeId, patch) =>
    set((state) => ({
      workshops: state.workshops.map((workshop) =>
        workshop.id === workshopId
          ? {
              ...workshop,
              nodes: workshop.nodes.map((node) =>
                node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
              ),
            }
          : workshop,
      ),
    })),

  addStep: () =>
    set((state) =>
      updateActiveWorkshop(state, (workshop) => {
        const lastNode = workshop.nodes.at(-1)
        // ID этапа выводим из уже существующих узлов цеха, чтобы после F5
        // не создавались дубликаты (модульный счётчик обнулялся бы при перезагрузке).
        const stepNumber = workshop.nodes.reduce((max, node) => {
          const match = /^step-(\d+)$/.exec(node.id ?? '')
          return match ? Math.max(max, Number(match[1])) : max
        }, 0) + 1
        const id = `step-${stepNumber}`
        const newNode = {
          id,
          type: 'vsm',
          position: {
            x: lastNode ? lastNode.position.x + 250 : 20,
            y: lastNode?.position.y ?? 150,
          },
          data: {
            label: `Новый этап ${workshop.nodes.length + 1}`,
            kind: 'operation',
            cycleTime: 0,
            leadTime: 5,
          },
        }

        return {
          nodes: [...workshop.nodes, newNode],
          edges: lastNode ? [...workshop.edges, createEdge(lastNode.id, id)] : workshop.edges,
        }
      }),
    ),

  resetFlow: () =>
    set((state) =>
      updateActiveWorkshop(state, (workshop) => {
        const source = defaultForWorkshop(workshop)
        return {
          ...workshop,
          nodes: cloneFlow(source.nodes),
          edges: cloneFlow(source.edges),
        }
      }),
    ),

  saveFlowToServer: async () => {
    const token = useAuthStore.getState().token
    const response = await fetch(`${API_URL}/api/workshops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workshops: get().workshops }),
    })
    if (!response.ok) {
      throw new Error(`Не удалось сохранить цеха: ${response.status}`)
    }
  },

  uploadPanorama: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_URL}/api/upload/panorama`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Не удалось загрузить панораму: ${response.status}`)
    }
    const data = await response.json()
    if (!data?.url) return
    set((state) =>
      updateActiveWorkshop(state, (workshop) => ({
        ...workshop,
        // Сразу абсолютный URL: Pannellum не должен резолвить его от Vite-origin (:5173).
        panorama_url: resolveBackendUrl(data.url),
      })),
    )
    await get().saveFlowToServer()
  },

  loadFlowFromServer: async () => {
    const token = useAuthStore.getState().token
    if (!token) return
    const response = await fetch(`${API_URL}/api/workshops`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    // 404 означает «данных ещё нет» — это нормальная ситуация, ничего не делаем.
    if (response.status === 404) return
    if (!response.ok) {
      throw new Error(`Не удалось загрузить цеха: ${response.status}`)
    }

    const workshops = await response.json()
    // Пустой массив тоже ничего не делаем — иначе затёрли бы локальные цеха.
    if (!Array.isArray(workshops) || workshops.length === 0) return

    // Легаси-значения из БД/localStorage (/uploads/... или относительные пути)
    // приводим к абсолютному URL бэкенда.
    const normalized = workshops.map((workshop) =>
      workshop?.panorama_url
        ? { ...workshop, panorama_url: resolveBackendUrl(workshop.panorama_url) }
        : workshop,
    )

    set({
      workshops: normalized,
      activeWorkshopId: normalized[0]?.id || 'w1',
    })
  },
}), {
  name: 'kataxone-vsm-v2',
  version: 6,
  // Сохраняем только сами цеха. activeWorkshopId намеренно не персистим:
  // после F5 активным снова становится первый цех (w1), но созданные цеха не теряются.
  partialize: (state) => ({ workshops: state.workshops }),
  // Принудительно сбрасываем на чистые INITIAL_WORKSHOPS.
  migrate: (persistedState, version) =>
    version < 6 ? { workshops: cloneFlow(INITIAL_WORKSHOPS) } : persistedState,
  merge: (persistedState, currentState) => {
    // Страховка: если битые данные всё же просочились (цех без id) — генерируем id.
    const workshops = Array.isArray(persistedState.workshops)
      ? persistedState.workshops.map((workshop) =>
          workshop?.id ? workshop : { ...workshop, id: generateWorkshopId() },
        )
      : cloneFlow(INITIAL_WORKSHOPS)
    // Легаси-ссылки на панорамы из localStorage тоже приводим к URL бэкенда.
    const normalizedWorkshops = workshops.map((workshop) =>
      workshop?.panorama_url
        ? { ...workshop, panorama_url: resolveBackendUrl(workshop.panorama_url) }
        : workshop,
    )
    return {
      ...currentState,
      ...persistedState,
      workshops: normalizedWorkshops,
      activeWorkshopId: currentState.activeWorkshopId,
    }
  },
}))
