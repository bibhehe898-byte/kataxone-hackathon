"""Auto-Seed пилотного кейса «Фабрика процессов (РЦК Башкортостан) — VENIO-C».

Данные полностью соответствуют SPEC.md, раздел 3 «Точные данные пилотного кейса».
Сидирование идемпотентно: если предприятие с тем же именем уже есть в БД — пропускаем.
"""

import json
import math
import time
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from . import models

PILOT_ENTERPRISE_NAME = "Фабрика процессов (РЦК Башкортостан)"
PILOT_WORKSHOP_NAME = "Сборка пульта управления регулятора давления газа VENIO-C"
PILOT_PRODUCT = "Пульт управления регулятора давления газа VENIO-C"

# --- Геометрия зала и склада/клиента ---
WAREHOUSE_POS: Tuple[float, float] = (3.0, 17.5)
CLIENT_POS: Tuple[float, float] = (1.8, 1.5)


def _dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _distance_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    return round(math.hypot(a[0] - b[0], a[1] - b[1]), 2)


# ---------------------------------------------------------------------------
# Рабочие места Раунда 1 «Как есть» (SPEC §3)
# ---------------------------------------------------------------------------
# cycle_time_sec подтверждён вычислимой суммой шагов в standard_steps.
# after_cycle_time_sec — целевые времена Раунда 2 «Как будет»
# (жёсткие значения из задания оркестрации; балансировка — не масштабирование).
STATIONS: List[dict] = [
    {
        "step": 1,
        "name": "Оператор №1: Сборка корпуса пилота и крышки нижней",
        "cycle": 81,
        "steps": [2, 3, 5, 2, 4, 5, 7, 54, 1],
        "pos": (4.2, 11.5),  # правый ряд
        "after_pos": (4.15, 3.5),
        "after_cycle": 84,
        "batch": 2,
        "components": [
            "корпус пилота 2 шт.",
            "крышка нижняя 2 шт.",
            "дюза 4 шт.",
            "кольцо резиновое дюзы 4 шт.",
            "прокладка резиновая 2 шт.",
            "винт М5×14 8 шт.",
            "шайба тонкая 8 шт.",
        ],
        "tools": ["ключ шестигранный", "тара", "СИЗ (перчатки, очки)"],
        "excess": ["ключ гаечный 10×12"],
    },
    {
        "step": 2,
        "name": "Оператор №2: Сборка корпуса управления и крышки верхней",
        "cycle": 66,
        "steps": [3, 2, 2, 1, 6, 51, 1],
        "pos": (1.6, 6.2),  # левый ряд
        "after_pos": (4.15, 5.5),
        "after_cycle": 68,
        "batch": 2,
        "components": [
            "корпус пилота 2 шт.",
            "крышка верхняя 2 шт.",
            "кольцо металлическое 2 шт.",
            "кольцо сетчатое 2 шт.",
            "шайба-решётка 2 шт.",
            "винт М5×14 8 шт.",
            "шайба тонкая 8 шт.",
        ],
        "tools": ["ключ шестигранник"],
        "excess": ["ключ гаечный 10×12"],
    },
    {
        "step": 3,
        "name": "Оператор №3: Сборка дросселя",
        "cycle": 13,
        "steps": [4, 3, 3, 2, 1],
        "pos": (1.6, 10.6),  # левый ряд
        "after_pos": (4.15, 7.5),
        "after_cycle": 56,
        "batch": 2,
        "components": [
            "дроссель 2 шт.",
            "игла дросселя 2 шт.",
            "кольцо дросселя 2 шт.",
            "конус зубчатый 2 шт.",
            "пружина возвратная 2 шт.",
        ],
        "tools": ["тара", "СИЗ (перчатки, очки)"],
        "excess": ["ключ шестигранник", "ключ гаечный 10×12"],
    },
    {
        "step": 4,
        "name": "Оператор №4: Установка тарелки и дросселя",
        "cycle": 61,
        "steps": [6, 4, 2, 2, 3, 4, 14, 25, 1],
        "pos": (1.6, 8.4),  # левый ряд
        "after_pos": (4.15, 9.5),
        "after_cycle": 72,
        "batch": 2,
        "components": [
            "тарелка 2 шт.",
            "дюза 2 шт.",
            "кольцо резиновое дюзы 2 шт.",
            "кольцо резиновое малое 2 шт.",
            "кольцо резиновое 2 шт.",
            "шайба тонкая 2 шт.",
            "винт М5×10 2 шт.",
            "(подсборки корпуса)",
        ],
        "tools": ["ключ гаечный 22", "шестигранник"],
        "excess": ["ключ гаечный 10×12", "ключ гаечный 19"],
    },
    {
        "step": 5,
        "name": "Оператор №5: Сборка мембраны",
        "cycle": 35,
        "steps": [9, 5, 4, 14, 3],
        "pos": (4.2, 9.0),  # правый ряд
        "after_pos": (2.0, 11.5),
        "after_cycle": 88,
        "batch": 2,
        "components": [
            "мембрана 2 шт.",
            "болт соединительный мембранный М6 2 шт.",
            "кольцо 017 2 шт.",
            "тарелка пружины 2 шт.",
            "гайка М6 2 шт.",
        ],
        "tools": ["ключ гаечный 10×12 (М10)"],
        "excess": ["ключ шестигранный"],
    },
    {
        "step": 6,
        "name": "Оператор №6: Сборка пробки",
        "cycle": 39,
        "steps": [19, 19, 1],
        "pos": (1.6, 12.8),  # левый ряд
        "after_pos": (2.0, 9.5),
        "after_cycle": 54,
        "batch": 2,
        "components": [
            "пробка 2 шт.",
            "болт регулировочный 2 шт.",
            "гайка М12 2 шт. (контроль вылета 25 мм)",
        ],
        "tools": ["линейка"],
        "excess": ["ключ гаечный"],
    },
    {
        "step": 7,
        "name": "Оператор №7: Сборка пульта управления",
        "cycle": 102,
        "steps": [6, 3, 2, 2, 4, 46, 11, 27, 1],
        "pos": (4.2, 6.2),  # правый ряд
        "after_pos": (2.0, 7.5),
        "after_cycle": 102,
        "batch": 2,
        "components": [
            "ограничитель мембранный 2 шт.",
            "пружина пилота 2 шт.",
            "тарелка регулировочная 2 шт.",
            "крышка 2 шт.",
            "болт М6 4 шт.",
            "гайка М6 4 шт.",
            "шайба А6 8 шт.",
            "(подсборки)",
        ],
        "tools": ["ключ гаечный 10×12"],
        "excess": ["ключ шестигранный"],
    },
    {
        "step": 8,
        "name": "Оператор №8: Установка 6 болтов в пульт управления",
        "cycle": 171,  # ГЛАВНОЕ УЗКОЕ МЕСТО — 142.5% при такте 120 с
        "steps": [170, 1],
        "pos": (4.2, 13.5),  # правый ряд
        "after_pos": (2.0, 5.5),
        "after_cycle": 96,
        "batch": 2,
        "components": [
            "болт М6 12 шт.",
            "шайба А6 24 шт.",
            "гайка М6 12 шт.",
        ],
        "tools": ["два рожковых ключа на 10"],
        "excess": ["ключ шестигранный"],
    },
    {
        "step": 9,
        "name": "Оператор №9: Установка штуцеров и патрубка в корпус пилота",
        "cycle": 82,
        "steps": [12, 29, 22, 18, 1],
        "pos": (1.6, 4.0),  # левый ряд
        "after_pos": (2.0, 3.5),
        "after_cycle": 82,
        "batch": 2,
        "components": [
            "патрубок 2 шт.",
            "штуцер 4 шт.",
            "штуцер с иглой 2 шт.",
            "штуцер с полой иглой 2 шт.",
        ],
        "tools": ["рожковый ключ 17×19 (19)"],
        "excess": ["лишний гаечный ключ"],
    },
    {
        "step": 10,
        "name": "Оператор №10: Контрольная операция (ОТК)",
        "cycle": 22,
        "steps": [12, 4, 5, 1],
        "pos": (4.2, 3.8),  # правый ряд, рядом с зоной «Клиент» (1.8, 1.5)
        "after_pos": (3.0, 2.0),
        "after_cycle": 22,
        "batch": 1,
        "kind": "control",
        "components": [],
        "tools": ["линейка"],
        "excess": ["ключ гаечный"],
    },
]

# Транспортное время рейсов со склада к столам 1–9 (SPEC §3): 15,15,20,15,15,10,20,15,15.
WAREHOUSE_LEG_SEC: List[int] = [15, 15, 20, 15, 15, 10, 20, 15, 15]

# Время цикла после балансировки (Раунд 2). Порядок = номера операторов.
AFTER_CYCLE_BY_OP: Dict[int, int] = {s["step"]: s["after_cycle"] for s in STATIONS}

# ---------------------------------------------------------------------------
# Инфоцентр РЦК (SPEC §3): Безопасность 0 · Качество 33% · Затраты 573к ·
# Себестоимость 286.5к · НЗП 71.5к -> 74к.
# ---------------------------------------------------------------------------
INFOCENTER = {
    "safety": {"incidents": 0, "violations": 0, "note": "0 происшествий и нарушений"},
    "quality": {
        "first_pass_yield": 33.0,
        "defects": 7,
        "accepted": 2,
        "produced": 10,
        "note": "Ограничение по узкому месту + брак в потоке; клиенту сдано 2 шт. за смену",
    },
    "costs": {
        "total": 573000.0,
        "unit_cost": 286500.0,
        "items": {
            "fot": 160000.0,
            "equipment": 153000.0,
            "overhead": 200000.0,
            "materials": 60000.0,
        },
        "note": "Итого затраты смены = 573 000 ₽ (ФОТ 160к + оборуд. 153к + общехоз. 200к + материалы 60к)",
    },
    "wip": {
        "start": 71500.0,
        "end": 74000.0,
        "frozen": 2500.0,
        "note": "НЗП заморожено +2 500 ₽",
    },
}


def _std_steps(seconds: List[int]) -> List[str]:
    return [f"Шаг {i + 1}: {s} с" for i, s in enumerate(seconds)]


def _build_nodes(db: Session, workshop: models.Workshop, is_baseline: bool) -> Dict[int, models.ProcessNode]:
    """Создаёт рабочие места (линии склада/операторов/клиента) и возвращает их по step_number."""
    nodes: Dict[int, models.ProcessNode] = {}

    # Склад
    warehouse = models.ProcessNode(
        workshop_id=workshop.id,
        step_number=0,
        name="Склад комплектующих",
        kind="warehouse",
        cycle_time_sec=0.0,
        operators_count=1,
        batch_size=2,
        pos_x_m=WAREHOUSE_POS[0],
        pos_y_m=WAREHOUSE_POS[1],
        tools_required_json=_dumps(["тара (партии по 2 шт.)"]),
        excess_items_5s_json=_dumps([]),
        components_json=_dumps([]),
        standard_steps_json=_dumps([]),
        is_baseline=is_baseline,
    )
    db.add(warehouse)
    nodes[0] = warehouse

    for s in STATIONS:
        pos = s["pos"] if is_baseline else s["after_pos"]
        cycle = s["cycle"] if is_baseline else s["after_cycle"]
        node = models.ProcessNode(
            workshop_id=workshop.id,
            step_number=s["step"],
            name=s["name"],
            kind=s.get("kind", "operation"),
            cycle_time_sec=float(cycle),
            operators_count=1,
            batch_size=s["batch"],
            pos_x_m=pos[0],
            pos_y_m=pos[1],
            tools_required_json=_dumps(s["tools"]),
            excess_items_5s_json=_dumps(s["excess"]),
            components_json=_dumps(s["components"]),
            standard_steps_json=_dumps(_std_steps(s["steps"])),
            is_baseline=is_baseline,
        )
        db.add(node)
        nodes[s["step"]] = node

    # Клиент (зона приёмки)
    client = models.ProcessNode(
        workshop_id=workshop.id,
        step_number=99,
        name="Клиент (зона приёмки изделия)",
        kind="client",
        cycle_time_sec=0.0,
        operators_count=1,
        batch_size=1,
        pos_x_m=CLIENT_POS[0],
        pos_y_m=CLIENT_POS[1],
        tools_required_json=_dumps([]),
        excess_items_5s_json=_dumps([]),
        components_json=_dumps([]),
        standard_steps_json=_dumps([]),
        is_baseline=is_baseline,
    )
    db.add(client)
    nodes[99] = client

    db.flush()
    return nodes


def _build_edges(
    db: Session,
    workshop: models.Workshop,
    nodes: Dict[int, models.ProcessNode],
    is_baseline: bool,
) -> List[models.ProcessEdge]:
    """Маршруты логиста: склад → столы 1–9 → ОТК → клиент (+ связка узлов)."""
    edges: List[models.ProcessEdge] = []

    def add_edge(src_step: int, dst_step: int, transport_sec: float) -> None:
        src = nodes[src_step]
        dst = nodes[dst_step]
        src_pos = (src.pos_x_m, src.pos_y_m)
        dst_pos = (dst.pos_x_m, dst.pos_y_m)
        edge = models.ProcessEdge(
            workshop_id=workshop.id,
            source_node_id=src.id,
            target_node_id=dst.id,
            transport_time_sec=float(transport_sec),
            batch_size=2,
            distance_m=_distance_m(src_pos, dst_pos),
            is_baseline=is_baseline,
        )
        db.add(edge)
        edges.append(edge)

    if is_baseline:
        # Первичная развозка со склада к столам 1–9.
        for idx, op_step in enumerate(range(1, 10)):
            add_edge(0, op_step, WAREHOUSE_LEG_SEC[idx])
        # Технологическая цепочка подсборок внутри цеха (порядок операций).
        for op_step in range(1, 10):
            add_edge(op_step, op_step + 1, 10)
        # Готовое изделие: ОТК (№10) → клиент.
        add_edge(10, 99, 5)
    else:
        # Компактная U-ячейка: короткие рейсы логиста.
        for op_step in range(1, 10):
            add_edge(0, op_step, 8)
        for op_step in range(1, 10):
            add_edge(op_step, op_step + 1, 5)
        add_edge(10, 99, 3)

    db.flush()
    return edges


def _build_pois(
    db: Session,
    workshop: models.Workshop,
    nodes: Dict[int, models.ProcessNode],
    is_baseline: bool,
) -> None:
    """Точки интереса 360° для ключевых рабочих мест (с кейсами До/После)."""
    poi_defs = [
        {
            "step": 8,
            "title": "Оператор №8 — Узкое место",
            "problem": "Закручивание 6 комплектов (болт М6 + 2 шайбы А6 + гайка М6). "
            "Время цикла 171 с при такте 120 с — загрузка 142.5%.",
            "solution": "Разделить/перераспределить операцию, выровнять загрузку до такта.",
            "before": "171 с · 142.5%",
            "after": "96 с · 80%",
            "yaw": -146.0,
            "pitch": -2.0,
        },
        {
            "step": 3,
            "title": "Оператор №3 — Недозагрузка",
            "problem": "Сборка дросселя всего 13 с (5 шагов) — сильная недозагрузка.",
            "solution": "Передать часть операций с перегруженных мест.",
            "before": "13 с · 10.8%",
            "after": "56 с · 46.7%",
            "yaw": -95.0,
            "pitch": -2.0,
        },
        {
            "step": 10,
            "title": "Оператор №10 — ОТК",
            "problem": "Контрольная операция 22 с, осмотр и замер вылета болта 25 мм.",
            "solution": "Встроенный контроль по ходу потока.",
            "before": "22 с · 18.3%",
            "after": "22 с · 18.3%",
            "yaw": 35.0,
            "pitch": -2.0,
        },
        {
            "step": None,
            "title": "Эталонное рабочее место (5S)",
            "problem": "Лишние предметы на столах: ключи, оснастка не по нормативу.",
            "solution": "Организация рабочего места по системе 5S.",
            "before": "лишние ключи на столах",
            "after": "5S-стандарт соблюдён",
            "yaw": 117.0,
            "pitch": -2.0,
        },
    ]

    for poi in poi_defs:
        node = nodes.get(poi["step"]) if poi["step"] is not None else None
        db.add(
            models.POIMarker(
                workshop_id=workshop.id,
                node_id=node.id if node else None,
                pitch=poi["pitch"],
                yaw=poi["yaw"],
                title=poi["title"],
                case_problem=poi["problem"],
                case_solution=poi["solution"],
                metric_before=poi["before"],
                metric_after=poi["after"],
                media_url=None,
                is_baseline=is_baseline,
            )
        )
    db.flush()


def seed_pilot(db: Session) -> Optional[models.Enterprise]:
    """Создаёт пилотное предприятие VENIO-C со всеми цехами/узлами/связями/POI.

    Возвращает созданное предприятие или None, если оно уже существует.
    """
    existing = (
        db.query(models.Enterprise)
        .filter(models.Enterprise.name == PILOT_ENTERPRISE_NAME)
        .first()
    )
    if existing:
        return None

    enterprise = models.Enterprise(
        name=PILOT_ENTERPRISE_NAME,
        industry="Машиностроение / учебная фабрика процессов",
        product_name=PILOT_PRODUCT,
        shift_duration_sec=1200,
        target_output=10,
        takt_time_sec=120.0,
        unit_price=70000.0,
        cost_fot=160000.0,
        cost_equipment=153000.0,
        cost_overhead=200000.0,
        cost_materials=60000.0,
        defect_in_flow_cost=15000.0,
        wip_start_cost=71500.0,
        wip_end_cost=74000.0,
        infocenter_json=_dumps(INFOCENTER),
        created_at_ms=int(time.time() * 1000),
    )
    db.add(enterprise)
    db.flush()

    for is_baseline in (True, False):
        workshop = models.Workshop(
            enterprise_id=enterprise.id,
            name=(
                f"{PILOT_WORKSHOP_NAME} — Раунд 1 «Как есть»"
                if is_baseline
                else f"{PILOT_WORKSHOP_NAME} — Раунд 2 «Как будет»"
            ),
            width_m=6.15,
            length_m=18.40,
            table_w_m=1.00,
            table_d_m=0.70,
            table_h_m=0.82,
            panorama_url="/panoramas/workshop-placeholder.png",
            explosion_diagram_url=None,
        )
        db.add(workshop)
        db.flush()

        nodes = _build_nodes(db, workshop, is_baseline)
        _build_edges(db, workshop, nodes, is_baseline)
        _build_pois(db, workshop, nodes, is_baseline)

    db.commit()
    db.refresh(enterprise)
    return enterprise
