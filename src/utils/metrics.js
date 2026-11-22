// Общие расчёты: загрузка, тепловая карта, раунды, маршруты «спагетти».

export const isOperational = (node) => node.kind === 'operation' || node.kind === 'control'

export const computeTakt = (enterprise) =>
  enterprise.target_output
    ? enterprise.shift_duration_sec / enterprise.target_output
    : enterprise.takt_time_sec || 120

/** Пересчитывает takt, load_percent и is_bottleneck. Вызывается при любом изменении. */
export function decorateEnterprise(enterprise) {
  const takt = computeTakt(enterprise)
  const workshops = (enterprise.workshops ?? []).map((workshop) => {
    const nodes = workshop.nodes ?? []
    const ops = nodes.filter((node) => node.kind === 'operation')
    const maxCycle = ops.reduce((max, node) => Math.max(max, node.cycle_time_sec), 0)
    return {
      ...workshop,
      nodes: nodes.map((node) => ({
        ...node,
        load_percent: takt ? Math.round((node.cycle_time_sec / takt) * 1000) / 10 : 0,
        is_bottleneck: node.kind === 'operation' && maxCycle > 0 && node.cycle_time_sec === maxCycle,
      })),
      edges: workshop.edges ?? [],
      pois: workshop.pois ?? [],
    }
  })
  return { ...enterprise, takt_time_sec: takt, workshops }
}

/** Тепловая карта: >100% критично (пульс), >90% красный, 85–90% янтарный, 50–85% зелёный, <50% голубой. */
export function heatInfo(load) {
  if (load > 100) return { key: 'critical', color: '#ef4444', pulse: true, label: 'Перегруз >100%' }
  if (load > 90) return { key: 'over', color: '#f43f5e', pulse: true, label: 'Перегруз >90%' }
  if (load >= 85) return { key: 'limit', color: '#f59e0b', pulse: false, label: 'Предел 85–90%' }
  if (load >= 50) return { key: 'ok', color: '#10b981', pulse: false, label: 'Оптимум 50–85%' }
  return { key: 'under', color: '#22d3ee', pulse: false, label: 'Недозагрузка <50%' }
}

export const isBaselineWorkshop = (workshop) =>
  (workshop.nodes ?? []).length === 0 || workshop.nodes.every((node) => node.is_baseline)

export function findRounds(enterprise) {
  const workshops = enterprise?.workshops ?? []
  const r1 = workshops.find(isBaselineWorkshop) ?? workshops[0] ?? null
  const r2 = workshops.find((w) => w !== r1 && !isBaselineWorkshop(w)) ?? null
  return { r1, r2 }
}

/**
 * План автобалансировки: избыток узкого места (сверх цели) переносится на соседние столы
 * (по близости номера этапа) без превышения потолка загрузки. Суммарное время сохраняется.
 * Возвращает { cycles: {nodeId: sec}, moves: [{fromId, toId, fromStep, toStep, sec}], donor }.
 */
export function computeBalancePlan(workshop, takt, { targetLoad = 0.8, capLoad = 0.96 } = {}) {
  const ops = (workshop?.nodes ?? []).filter((n) => n.kind === 'operation')
  const cycles = Object.fromEntries((workshop?.nodes ?? []).map((n) => [n.id, n.cycle_time_sec]))
  const moves = []
  const donor = bottleneckOf(workshop)
  if (!donor || !takt || donor.cycle_time_sec <= takt) return { cycles, moves, donor }
  const cap = Math.floor(takt * capLoad)
  let toMove = donor.cycle_time_sec - Math.min(Math.round(takt * targetLoad), takt)
  const recipients = ops
    .filter((n) => n.id !== donor.id)
    .sort((a, b) => Math.abs(a.step_number - donor.step_number) - Math.abs(b.step_number - donor.step_number) || a.step_number - b.step_number)
  for (const r of recipients) {
    if (toMove <= 0) break
    const room = cap - cycles[r.id]
    if (room <= 0) continue
    const sec = Math.min(room, toMove)
    cycles[r.id] += sec
    cycles[donor.id] -= sec
    toMove -= sec
    moves.push({ fromId: donor.id, toId: r.id, fromStep: donor.step_number, toStep: r.step_number, sec })
  }
  return { cycles, moves, donor }
}

export function bottleneckOf(workshop) {
  const ops = (workshop?.nodes ?? []).filter((node) => node.kind === 'operation')
  if (!ops.length) return null
  return ops.reduce((best, node) => (node.cycle_time_sec > best.cycle_time_sec ? node : best))
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const pathLength = (pts) => pts.reduce((sum, p, i) => (i ? sum + dist(pts[i - 1], p) : 0), 0)

const manhattan = (a, b, aisleX) => [a, [aisleX, a[1]], [aisleX, b[1]], b]

/**
 * Маршруты в координатах зала (x, y). Раунд 1 — челночные рейсы логиста к каждому столу;
 * Раунд 2 (U-ячейка) — один «молочный маршрут» по центральному проходу.
 */
export function buildRoutes(workshop) {
  const nodes = workshop?.nodes ?? []
  const warehouse = nodes.find((n) => n.kind === 'warehouse')
  const client = nodes.find((n) => n.kind === 'client')
  const ops = nodes.filter(isOperational).sort((a, b) => a.step_number - b.step_number)
  const aisle = (workshop?.width_m ?? 6.15) / 2
  const baseline = isBaselineWorkshop(workshop ?? { nodes: [] })
  const pos = (n) => [n.pos_x_m, n.pos_y_m]

  const logist = []
  if (warehouse) {
    const workTables = ops.filter((n) => n.kind === 'operation')
    if (baseline) {
      workTables.forEach((op) =>
        logist.push({ id: `l-${op.id}`, pts: manhattan(pos(warehouse), pos(op), aisle), pingPong: true }),
      )
    } else if (workTables.length) {
      const lowest = Math.min(...ops.map((n) => n.pos_y_m))
      logist.push({
        id: 'milk-run',
        pts: [pos(warehouse), [aisle, warehouse.pos_y_m], [aisle, lowest]],
        pingPong: true,
      })
    }
  }

  const flow = []
  const chain = client ? [...ops, client] : ops
  for (let i = 0; i < chain.length - 1; i += 1) {
    flow.push({ id: `f-${chain[i].id}`, pts: manhattan(pos(chain[i]), pos(chain[i + 1]), aisle), pingPong: false })
  }
  return { logist, flow, baseline }
}

export function routeMetrics(workshop) {
  const { logist, flow, baseline } = buildRoutes(workshop)
  const logistM = logist.reduce((s, r) => s + pathLength(r.pts) * 2, 0)
  const flowM = flow.reduce((s, r) => s + pathLength(r.pts), 0)
  const transportSec = (workshop?.edges ?? []).reduce((s, e) => s + (e.transport_time_sec || 0), 0)
  return {
    baseline,
    logistM: Math.round(logistM * 10) / 10,
    flowM: Math.round(flowM * 10) / 10,
    totalM: Math.round((logistM + flowM) * 10) / 10,
    transportSec,
    trips: logist.length,
  }
}
