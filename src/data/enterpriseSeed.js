// Локальный fallback-сид пилота «Фабрика процессов (РЦК Башкортостан) — VENIO-C».
// Зеркалит backend/seed.py (SPEC §3). Используется, если FastAPI-сервер недоступен.

export const PILOT_ID = 'local-pilot'
export const PILOT_NAME = 'Фабрика процессов (РЦК Башкортостан)'
export const PILOT_WORKSHOP_NAME = 'Сборка пульта управления регулятора давления газа VENIO-C'
export const WAREHOUSE_POS = [3.0, 17.5]
export const CLIENT_POS = [1.8, 1.5]
const WAREHOUSE_LEG_SEC = [15, 15, 20, 15, 15, 10, 20, 15, 15]

const S = (step, name, cycle, steps, pos, afterPos, afterCycle, components, tools, excess, kind = 'operation', standardSteps = null) => ({
  step, name, cycle, steps, pos, afterPos, afterCycle, components, tools, excess, kind, standardSteps,
})

export const STATIONS = [
  S(1, 'Оператор №1: Сборка корпуса пилота и крышки нижней', 81, [2, 3, 5, 2, 4, 5, 7, 54, 1], [4.2, 11.5], [4.15, 3.5], 84,
    ['крышка нижняя 2 шт.', 'дюза 4 шт.', 'кольцо резиновое дюзы 4 шт.', 'прокладка резиновая 2 шт.', 'корпус 2 шт.', 'винт М5×14 8 шт.', 'шайба тонкая 8 шт.'],
    ['ключи шестигранные', 'перчатки', 'очки'], ['гаечный ключ 10×12'], 'operation',
    ['Взять крышку нижнюю: 2 с', 'Взять дюзы (2 шт.): 3 с', 'Установить дюзы: 5 с', 'Взять кольца: 2 с', 'Установить кольца: 4 с', 'Взять корпус и прокладку, установить: 5 с', 'Шаг 7: 7 с', 'Шаг 8: 54 с', 'Шаг 9: 1 с']),
  S(2, 'Оператор №2: Сборка корпуса управления и крышки верхней', 66, [3, 2, 2, 1, 6, 51, 1], [1.6, 6.2], [4.15, 5.5], 68,
    ['корпус пилота 2 шт.', 'крышка верхняя 2 шт.', 'кольцо металлическое 2 шт.', 'кольцо сетчатое 2 шт.', 'шайба-решётка 2 шт.', 'винт М5×14 8 шт.', 'шайба тонкая 8 шт.'],
    ['ключ шестигранник'], ['ключ гаечный 10×12']),
  S(3, 'Оператор №3: Сборка дросселя', 13, [4, 3, 3, 2, 1], [1.6, 10.6], [4.15, 7.5], 56,
    ['дроссель 2 шт.', 'игла дросселя 2 шт.', 'кольцо дросселя 2 шт.', 'конус зубчатый 2 шт.', 'пружина возвратная 2 шт.'],
    ['тара', 'СИЗ (перчатки, очки)'], ['ключ шестигранник', 'ключ гаечный 10×12']),
  S(4, 'Оператор №4: Установка тарелки и дросселя', 61, [6, 4, 2, 2, 3, 4, 14, 25, 1], [1.6, 8.4], [4.15, 9.5], 72,
    ['тарелка 2 шт.', 'дюза 2 шт.', 'кольцо резиновое дюзы 2 шт.', 'кольцо резиновое малое 2 шт.', 'кольцо резиновое 2 шт.', 'шайба тонкая 2 шт.', 'винт М5×10 2 шт.', '(подсборки корпуса)'],
    ['ключ гаечный 22', 'шестигранник'], ['ключ гаечный 10×12', 'ключ гаечный 19']),
  S(5, 'Оператор №5: Сборка мембраны', 35, [9, 5, 4, 14, 3], [4.2, 9.0], [2.0, 11.5], 88,
    ['мембрана 2 шт.', 'болт соединительный мембранный М6 2 шт.', 'кольцо 017 2 шт.', 'тарелка пружины 2 шт.', 'гайка М6 2 шт.'],
    ['ключ гаечный 10×12 (М10)'], ['ключ шестигранный']),
  S(6, 'Оператор №6: Сборка пробки', 39, [19, 19, 1], [1.6, 12.8], [2.0, 9.5], 54,
    ['пробка 2 шт.', 'болт регулировочный 2 шт.', 'гайка М12 2 шт. (контроль вылета 25 мм)'], ['линейка'], ['ключ гаечный']),
  S(7, 'Оператор №7: Сборка пульта управления', 102, [6, 3, 2, 2, 4, 46, 11, 27, 1], [4.2, 6.2], [2.0, 7.5], 102,
    ['ограничитель мембранный 2 шт.', 'пружина пилота 2 шт.', 'тарелка регулировочная 2 шт.', 'крышка 2 шт.', 'болт М6 4 шт.', 'гайка М6 4 шт.', 'шайба А6 8 шт.', '(подсборки)'],
    ['ключ гаечный 10×12'], ['ключ шестигранный']),
  S(8, 'Оператор №8: Установка 6 болтов в пульт управления', 171, [170, 1], [4.2, 13.5], [2.0, 5.5], 96,
    ['болт М6 12 шт.', 'шайба А6 24 шт.', 'гайка М6 12 шт.'], ['два рожковых ключа на 10'], ['ключ шестигранный']),
  S(9, 'Оператор №9: Установка штуцеров и патрубка в корпус пилота', 82, [12, 29, 22, 18, 1], [1.6, 4.0], [2.0, 3.5], 82,
    ['патрубок 2 шт.', 'штуцер 4 шт.', 'штуцер с иглой 2 шт.', 'штуцер с полой иглой 2 шт.'], ['рожковый ключ 17×19 (19)'], ['лишний гаечный ключ']),
  S(10, 'Оператор №10: Контрольная операция (ОТК)', 22, [12, 4, 5, 1], [4.2, 3.8], [3.0, 2.0], 22, [], ['линейка'], ['ключ гаечный'], 'control'),
]

const POIS = [
  [8, 'Оператор №8 — Узкое место', 'Закручивание 6 комплектов. Цикл 171 с при такте 120 с — загрузка 142.5%.', 'Перераспределить операцию, выровнять загрузку до такта.', '171 с · 142.5%', '96 с · 80%', -146],
  [3, 'Оператор №3 — Недозагрузка', 'Сборка дросселя всего 13 с — сильная недозагрузка.', 'Передать часть операций с перегруженных мест.', '13 с · 10.8%', '56 с · 46.7%', -95],
  [10, 'Оператор №10 — ОТК', 'Контрольная операция 22 с, замер вылета болта 25 мм.', 'Встроенный контроль по ходу потока.', '22 с · 18.3%', '22 с · 18.3%', 35],
  [null, 'Эталонное рабочее место (5S)', 'Лишние предметы на столах: ключи, оснастка не по нормативу.', 'Организация рабочего места по 5S.', 'лишние ключи на столах', '5S-стандарт соблюдён', 117],
]

const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * 100) / 100

function buildWorkshop(entId, isBaseline) {
  const wid = `lw-pilot-${isBaseline ? 1 : 2}`
  const mk = (step, kind, name, cycle, pos, extra = {}) => ({
    id: `${wid}-n${step}`, workshop_id: wid, step_number: step, name, kind, cycle_time_sec: cycle,
    operators_count: 1, batch_size: 2, pos_x_m: pos[0], pos_y_m: pos[1],
    tools_required: [], excess_items_5s: [], components: [], standard_steps: [], photo_url: null,
    is_baseline: isBaseline, ...extra,
  })
  const nodes = [mk(0, 'warehouse', 'Склад комплектующих', 0, WAREHOUSE_POS, { tools_required: ['тара (партии по 2 шт.)'] })]
  STATIONS.forEach((s) =>
    nodes.push(mk(s.step, s.kind, s.name, isBaseline ? s.cycle : s.afterCycle, isBaseline ? s.pos : s.afterPos, {
      batch_size: s.step === 10 ? 1 : 2,
      tools_required: s.tools, excess_items_5s: s.excess, components: s.components,
      standard_steps: s.standardSteps || s.steps.map((sec, i) => `Шаг ${i + 1}: ${sec} с`),
    })),
  )
  nodes.push(mk(99, 'client', 'Клиент (зона приёмки изделия)', 0, CLIENT_POS, { batch_size: 1 }))
  const byStep = Object.fromEntries(nodes.map((n) => [n.step_number, n]))

  const edges = []
  const add = (a, b, sec) =>
    edges.push({
      id: `${wid}-e${edges.length}`, workshop_id: wid, source_node_id: byStep[a].id, target_node_id: byStep[b].id,
      transport_time_sec: sec, batch_size: 2, is_baseline: isBaseline,
      distance_m: dist([byStep[a].pos_x_m, byStep[a].pos_y_m], [byStep[b].pos_x_m, byStep[b].pos_y_m]),
    })
  for (let i = 1; i <= 9; i += 1) add(0, i, isBaseline ? WAREHOUSE_LEG_SEC[i - 1] : 8)
  for (let i = 1; i <= 9; i += 1) add(i, i + 1, isBaseline ? 10 : 5)
  add(10, 99, isBaseline ? 5 : 3)

  const pois = POIS.map(([step, title, problem, solution, before, after, yaw], i) => ({
    id: `${wid}-p${i}`, workshop_id: wid, node_id: step == null ? null : byStep[step].id, pitch: -2, yaw,
    title, case_problem: problem, case_solution: solution, metric_before: before, metric_after: after,
    media_url: null, is_baseline: isBaseline,
  }))

  return {
    id: wid, enterprise_id: entId,
    name: `${PILOT_WORKSHOP_NAME} — Раунд ${isBaseline ? '1 «Как есть»' : '2 «Как будет»'}`,
    width_m: 6.15, length_m: 18.4, table_w_m: 1.0, table_d_m: 0.7, table_h_m: 0.82,
    panorama_url: null, explosion_diagram_url: null,
    nodes, edges, pois,
  }
}

export function buildPilotEnterprise() {
  return {
    id: PILOT_ID, name: PILOT_NAME, industry: 'Машиностроение / учебная фабрика процессов',
    product_name: 'Пульт управления регулятора давления газа VENIO-C',
    shift_duration_sec: 1200, target_output: 10, takt_time_sec: 120, unit_price: 70000,
    cost_fot: 160000, cost_equipment: 153000, cost_overhead: 200000, cost_materials: 60000,
    defect_in_flow_cost: 15000, wip_start_cost: 71500, wip_end_cost: 74000, created_at_ms: 0,
    workshops: [buildWorkshop(PILOT_ID, true), buildWorkshop(PILOT_ID, false)],
  }
}

/** Заготовка цеха для вновь созданного предприятия: склад → 3 стола → клиент. */
export function buildDefaultWorkshop(entId, name = 'Основной цех') {
  const wid = `lw-${entId}-${Date.now()}`
  const mk = (step, kind, nm, cycle, pos) => ({
    id: `${wid}-n${step}`, workshop_id: wid, step_number: step, name: nm, kind, cycle_time_sec: cycle,
    operators_count: 1, batch_size: 2, pos_x_m: pos[0], pos_y_m: pos[1], tools_required: [],
    excess_items_5s: [], components: [], standard_steps: [], photo_url: null, is_baseline: true,
  })
  const nodes = [
    mk(0, 'warehouse', 'Склад', 0, [3.0, 17.5]),
    mk(1, 'operation', 'Операция 1', 60, [4.2, 12]),
    mk(2, 'operation', 'Операция 2', 80, [1.6, 8]),
    mk(3, 'operation', 'Операция 3', 40, [4.2, 4]),
    mk(99, 'client', 'Клиент', 0, [1.8, 1.5]),
  ]
  return {
    id: wid, enterprise_id: entId, name, width_m: 6.15, length_m: 18.4, table_w_m: 1, table_d_m: 0.7,
    table_h_m: 0.82, panorama_url: null, explosion_diagram_url: null,
    nodes, edges: [], pois: [],
  }
}
