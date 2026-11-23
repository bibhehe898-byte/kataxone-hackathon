import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, uploadFile } from '../api/client'
import { buildDefaultWorkshop, buildPilotEnterprise } from '../data/enterpriseSeed'
import { computeBalancePlan, computeTakt, decorateEnterprise, findRounds } from '../utils/metrics'
import { useVsmStore } from './useVsmStore'

/**
 * Общий стор предприятий. Источник правды — FastAPI (/api через Vite-proxy);
 * при недоступности сервера работает на идентичном локальном сиде VENIO-C.
 *
 * API для Дашборда (Subtask 3):
 *   state: enterprises, activeEnterpriseId, activeWorkshopId, online, round
 *   selectors: getActiveEnterprise(), getActiveWorkshop(), getRounds()
 *   actions: updateEnterpriseParams(patch) (пересчёт takt), updateNodeCycle(workshopId, nodeId, sec),
 *            autoBalance() (применяет Раунд 2 к потоку → 3D-тур обновляется), resetBalance(),
 *            fetchAutobalancePreview()
 */

const isLocalId = (id) => typeof id === 'string'
const clone = (value) => structuredClone(value)

const replaceEnterprise = (state, enterprise) => ({
  enterprises: state.enterprises.map((e) => (e.id === enterprise.id ? enterprise : e)),
})

function syncVsm(enterprise) {
  try {
    useVsmStore.getState().syncFromEnterprise(enterprise)
  } catch (error) {
    console.error('VSM sync failed', error)
  }
}

export const useEnterpriseStore = create(
  persist(
    (set, get) => ({
      enterprises: [],
      activeEnterpriseId: null,
      activeWorkshopId: null,
      online: false,
      loading: false,
      localEnterprises: [], // созданные/импортированные офлайн (сохраняются в localStorage)
      balanced: {}, // enterpriseId -> true, если применена автобалансировка
      balanceLog: {}, // enterpriseId -> протокол перераспределения [{fromStep,toStep,sec}]
      originalBaseline: {}, // enterpriseId -> снимок Раунда 1 до балансировки
      tourFocusNodeId: null,

      // ---------- selectors ----------
      getActiveEnterprise: () => get().enterprises.find((e) => e.id === get().activeEnterpriseId) ?? null,
      getActiveWorkshop: () => {
        const ent = get().getActiveEnterprise()
        return ent?.workshops.find((w) => w.id === get().activeWorkshopId) ?? ent?.workshops[0] ?? null
      },
      getRounds: () => findRounds(get().getActiveEnterprise()),

      // ---------- loading ----------
      loadEnterprises: async () => {
        set({ loading: true })
        let list = []
        let online = false
        try {
          const summaries = await api('/api/enterprises')
          list = await Promise.all(summaries.map((s) => api(`/api/enterprises/${s.id}`)))
          online = true
        } catch {
          list = [buildPilotEnterprise()]
        }
        const state = get()
        const locals = state.localEnterprises.filter((l) => !list.some((e) => e.id === l.id))
        const enterprises = [...list, ...locals].map(decorateEnterprise)

        // Состояние автобалансировки не переживает перезагрузку данных с сервера.
        let activeId = state.activeEnterpriseId
        if (!enterprises.some((e) => e.id === activeId)) activeId = enterprises[0]?.id ?? null
        const active = enterprises.find((e) => e.id === activeId)
        let wsId = state.activeWorkshopId
        if (!active?.workshops.some((w) => w.id === wsId)) wsId = findRounds(active).r1?.id ?? active?.workshops[0]?.id ?? null
        set({ enterprises, online, loading: false, activeEnterpriseId: activeId, activeWorkshopId: wsId, balanced: {}, balanceLog: {}, originalBaseline: {} })
        if (active) syncVsm(active)
      },

      selectEnterprise: (id) => {
        const ent = get().enterprises.find((e) => e.id === id)
        if (!ent) return
        set({ activeEnterpriseId: id, activeWorkshopId: findRounds(ent).r1?.id ?? ent.workshops[0]?.id ?? null })
        syncVsm(ent)
      },

      setActiveWorkshop: (id) => {
        if (!id) return
        set({ activeWorkshopId: id })
      },
      setTourFocusNodeId: (id) => set({ tourFocusNodeId: id }),

      // ---------- enterprises CRUD ----------
      createEnterprise: async (form) => {
        const payload = {
          name: form.name,
          industry: form.industry || null,
          product_name: form.product_name || null,
          shift_duration_sec: Number(form.shift_duration_sec) || 1200,
          target_output: Number(form.target_output) || 10,
          unit_price: Number(form.unit_price) || 0,
          cost_fot: Number(form.cost_fot) || 0,
          cost_equipment: Number(form.cost_equipment) || 0,
          cost_overhead: Number(form.cost_overhead) || 0,
          cost_materials: Number(form.cost_materials) || 0,
          defect_in_flow_cost: Number(form.defect_in_flow_cost) || 0,
          wip_start_cost: Number(form.wip_start_cost) || 0,
          wip_end_cost: Number(form.wip_end_cost) || 0,
        }
        const workshopDims = {
          width_m: Number(form.width_m) || 6.15,
          length_m: Number(form.length_m) || 18.4,
        }
        let enterprise
        try {
          // Эндпоинт import создаёт предприятие вместе с цехом и узлами за один запрос.
          const base = buildDefaultWorkshop('tmp', form.workshop_name || 'Основной цех')
          const imported = await api('/api/enterprises/import', {
            method: 'POST',
            body: { enterprise: { ...payload, workshops: [{ ...base, ...workshopDims }] } },
          })
          enterprise = await api(`/api/enterprises/${imported.id}`)
        } catch {
          const id = `local-${Date.now()}`
          enterprise = {
            ...payload,
            id,
            takt_time_sec: payload.shift_duration_sec / payload.target_output,
            created_at_ms: Date.now(),
            workshops: [{ ...buildDefaultWorkshop(id, form.workshop_name || 'Основной цех'), ...workshopDims }],
          }
          set((s) => ({ localEnterprises: [...s.localEnterprises, enterprise] }))
        }
        enterprise = decorateEnterprise(enterprise)
        set((s) => ({ enterprises: [...s.enterprises, enterprise] }))
        get().selectEnterprise(enterprise.id)
        return enterprise
      },

      importEnterprise: async (json) => {
        let enterprise
        try {
          const created = await api('/api/enterprises/import', { method: 'POST', body: json })
          enterprise = await api(`/api/enterprises/${created.id}`)
        } catch {
          const src = json.enterprise ?? json
          const id = `local-${Date.now()}`
          const copy = clone(src)
          copy.id = id
          copy.workshops = (copy.workshops ?? []).map((w, i) => ({ ...w, id: `${id}-w${i}`, enterprise_id: id }))
          enterprise = copy
          set((s) => ({ localEnterprises: [...s.localEnterprises, enterprise] }))
        }
        enterprise = decorateEnterprise(enterprise)
        set((s) => ({ enterprises: [...s.enterprises, enterprise] }))
        get().selectEnterprise(enterprise.id)
        return enterprise
      },

      exportEnterprise: async (id) => {
        try {
          if (!isLocalId(id)) return await api(`/api/enterprises/${id}/export`)
        } catch {
          // fallthrough на локальный экспорт
        }
        const ent = get().enterprises.find((e) => e.id === id)
        return { schema: 'kataxone.enterprise.v1', exported_at_ms: Date.now(), enterprise: clone(ent) }
      },

      deleteEnterprise: async (id) => {
        try {
          if (!isLocalId(id)) await api(`/api/enterprises/${id}`, { method: 'DELETE' })
        } catch {
          return false
        }
        set((s) => ({
          enterprises: s.enterprises.filter((e) => e.id !== id),
          localEnterprises: s.localEnterprises.filter((e) => e.id !== id),
        }))
        if (get().activeEnterpriseId === id) {
          const first = get().enterprises[0]
          if (first) get().selectEnterprise(first.id)
          else {
            set({ activeEnterpriseId: null, activeWorkshopId: null })
            syncVsm({ workshops: [] })
          }
        }
        return true
      },

      // ---------- parameters / balancing (для Дашборда) ----------
      updateEnterpriseParams: async (patch) => {
        const ent = get().getActiveEnterprise()
        if (!ent) return
        const merged = decorateEnterprise({ ...ent, ...patch, takt_time_sec: undefined })
        set((s) => replaceEnterprise(s, merged))
        syncVsm(merged) // такт изменился -> загрузка узлов в графе пересчитывается
        if (isLocalId(ent.id)) {
          set((s) => ({ localEnterprises: s.localEnterprises.map((e) => (e.id === ent.id ? merged : e)) }))
          return
        }
        try {
          await api(`/api/enterprises/${ent.id}`, { method: 'PUT', body: patch })
        } catch {
          set({ online: false })
        }
      },

      updateNodeCycle: (workshopId, nodeId, sec) => {
        const ent = get().getActiveEnterprise()
        if (!ent) return
        const next = decorateEnterprise({
          ...ent,
          workshops: ent.workshops.map((w) =>
            w.id !== workshopId ? w : { ...w, nodes: w.nodes.map((n) => (String(n.id) === String(nodeId) ? { ...n, cycle_time_sec: Number(sec) || 0 } : n)) },
          ),
        })
        set((s) => replaceEnterprise(s, next))
        syncVsm(next)
        if (isLocalId(ent.id)) {
          set((s) => ({ localEnterprises: s.localEnterprises.map((e) => (e.id === ent.id ? next : e)) }))
        }
      },

      fetchAutobalancePreview: async () => {
        const ent = get().getActiveEnterprise()
        if (!ent || isLocalId(ent.id)) return null
        try {
          return await api(`/api/enterprises/${ent.id}/autobalance`, { method: 'POST' })
        } catch {
          return null
        }
      },

      /** Применяет Раунд 2 (времена цикла и позиции столов) к Раунду 1 — 3D-тур перерисуется. */
      autoBalance: () => {
        const ent = get().getActiveEnterprise()
        const { r1, r2 } = findRounds(ent)
        if (!ent || !r1) return false
        if (get().balanced[ent.id]) return true
        const target = new Map((r2?.nodes ?? []).map((n) => [n.step_number, n]))
        const snapshot = get().originalBaseline[ent.id] ?? clone(r1)
        // Узкое место: переносим секунды на соседние столы (сумма времени сохраняется).
        const plan = computeBalancePlan(r1, computeTakt(ent))
        const next = decorateEnterprise({
          ...ent,
          workshops: ent.workshops.map((w) =>
            w.id !== r1.id
              ? w
              : {
                  ...w,
                  nodes: w.nodes.map((n) => {
                    const t = target.get(n.step_number)
                    if (n.kind !== 'operation' && n.kind !== 'control') return n
                    const moved = { ...n, cycle_time_sec: plan.cycles[n.id] ?? n.cycle_time_sec }
                    return t ? { ...moved, pos_x_m: t.pos_x_m, pos_y_m: t.pos_y_m } : moved
                  }),
                },
          ),
        })
        set((s) => ({
          ...replaceEnterprise(s, next),
          balanced: { ...s.balanced, [ent.id]: true },
          balanceLog: { ...s.balanceLog, [ent.id]: plan.moves },
          originalBaseline: { ...s.originalBaseline, [ent.id]: snapshot },
        }))
        syncVsm(next)
        return true
      },

      resetBalance: () => {
        const ent = get().getActiveEnterprise()
        const snapshot = ent && get().originalBaseline[ent.id]
        if (!snapshot) return
        const next = decorateEnterprise({
          ...ent,
          workshops: ent.workshops.map((w) => (w.id === snapshot.id ? snapshot : w)),
        })
        set((s) => ({ ...replaceEnterprise(s, next), balanced: { ...s.balanced, [ent.id]: false }, balanceLog: { ...s.balanceLog, [ent.id]: [] } }))
        syncVsm(next)
      },

      // ---------- 360° ----------
      setPanorama: async (workshopId, file) => {
        let url
        try {
          const res = await uploadFile(file)
          url = res.url
        } catch {
          url = URL.createObjectURL(file)
        }
        const ent = get().getActiveEnterprise()
        const next = {
          ...ent,
          workshops: ent.workshops.map((w) => (w.id === workshopId ? { ...w, panorama_url: url } : w)),
        }
        set((s) => replaceEnterprise(s, next))
        return url
      },

      // Обновляет URL панорамы активного цеха сразу (без повторной загрузки файла).
      // Используется после успешной загрузки в useVsmStore.uploadPanorama, чтобы тур
      // (читающий enterprise-стор) сразу показал новую панораму.
      applyPanorama: (workshopId, url) => {
        const ent = get().getActiveEnterprise() ?? get().enterprises[0]
        if (!ent || !url) return
        set((s) =>
          replaceEnterprise(s, {
            ...ent,
            workshops: ent.workshops.map((w) => (w.id === workshopId ? { ...w, panorama_url: url } : w)),
          }),
        )
      },

      addPoi: async (workshopId, poi) => {
        const ent = get().getActiveEnterprise()
        if (!ent) return null
        const workshop = ent.workshops.find((w) => w.id === workshopId)
        let saved
        const body = { ...poi, is_baseline: workshop?.nodes.every((n) => n.is_baseline) ?? true }
        try {
          if (isLocalId(workshopId)) throw new Error('local')
          saved = await api(`/api/workshops/${workshopId}/pois`, { method: 'POST', body })
        } catch {
          saved = { ...body, id: `lp-${Date.now()}`, workshop_id: workshopId }
        }
        const next = {
          ...ent,
          workshops: ent.workshops.map((w) => (w.id === workshopId ? { ...w, pois: [...w.pois, saved] } : w)),
        }
        set((s) => replaceEnterprise(s, next))
        if (isLocalId(ent.id)) {
          set((s) => ({ localEnterprises: s.localEnterprises.map((e) => (e.id === ent.id ? next : e)) }))
        }
        return saved
      },

      takt: () => computeTakt(get().getActiveEnterprise() ?? { shift_duration_sec: 1200, target_output: 10 }),
    }),
    {
      name: 'kataxone-enterprise-v1',
      version: 1,
      partialize: (s) => ({
        activeEnterpriseId: s.activeEnterpriseId,
        localEnterprises: s.localEnterprises,
      }),
    },
  ),
)
