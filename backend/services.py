"""Бизнес-логика backend Kataxone Enterprise: сериализация, экономика,
автобалансировка потока и импорт/экспорт предприятий в JSON.
"""

import json
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from . import models, seed

# ---------------------------------------------------------------------------
# Хелперы JSON
# ---------------------------------------------------------------------------


def _loads(value: Optional[str], default):
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def _dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Сериализация
# ---------------------------------------------------------------------------


def node_to_dict(node: models.ProcessNode, takt_time_sec: float, bottleneck_id: Optional[int]) -> Dict[str, Any]:
    load_percent = round(node.cycle_time_sec / takt_time_sec * 100, 1) if takt_time_sec else 0.0
    return {
        "id": node.id,
        "workshop_id": node.workshop_id,
        "step_number": node.step_number,
        "name": node.name,
        "kind": node.kind,
        "cycle_time_sec": node.cycle_time_sec,
        "cost": node.cost_value,
        "operators_count": node.operators_count,
        "batch_size": node.batch_size,
        "pos_x_m": node.pos_x_m,
        "pos_y_m": node.pos_y_m,
        "tools_required": _loads(node.tools_required_json, []),
        "excess_items_5s": _loads(node.excess_items_5s_json, []),
        "components": _loads(node.components_json, []),
        "standard_steps": _loads(node.standard_steps_json, []),
        "photo_url": node.photo_url,
        "is_baseline": node.is_baseline,
        "load_percent": load_percent,
        "is_bottleneck": bottleneck_id is not None and node.id == bottleneck_id,
    }


def edge_to_dict(edge: models.ProcessEdge) -> Dict[str, Any]:
    return {
        "id": edge.id,
        "workshop_id": edge.workshop_id,
        "source_node_id": edge.source_node_id,
        "target_node_id": edge.target_node_id,
        "transport_time_sec": edge.transport_time_sec,
        "batch_size": edge.batch_size,
        "distance_m": edge.distance_m,
        "is_baseline": edge.is_baseline,
    }


def poi_to_dict(poi: models.POIMarker) -> Dict[str, Any]:
    return {
        "id": poi.id,
        "workshop_id": poi.workshop_id,
        "node_id": poi.node_id,
        "pitch": poi.pitch,
        "yaw": poi.yaw,
        "title": poi.title,
        "case_problem": poi.case_problem,
        "case_solution": poi.case_solution,
        "metric_before": poi.metric_before,
        "metric_after": poi.metric_after,
        "media_url": poi.media_url,
        "is_baseline": poi.is_baseline,
    }


def workshop_to_dict(workshop: models.Workshop, include_children: bool = True) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "id": workshop.id,
        "enterprise_id": workshop.enterprise_id,
        "name": workshop.name,
        "width_m": workshop.width_m,
        "length_m": workshop.length_m,
        "table_w_m": workshop.table_w_m,
        "table_d_m": workshop.table_d_m,
        "table_h_m": workshop.table_h_m,
        "panorama_url": workshop.panorama_url,
        "explosion_diagram_url": workshop.explosion_diagram_url,
    }
    if include_children:
        nodes = list(workshop.nodes)
        bottleneck_id = find_bottleneck_id(nodes)
        data["nodes"] = [
            node_to_dict(n, workshop.enterprise.takt_time_sec, bottleneck_id) for n in nodes
        ]
        data["edges"] = [edge_to_dict(e) for e in _workshop_edges(workshop)]
        data["pois"] = [poi_to_dict(p) for p in workshop.pois]
    return data


def _workshop_edges(workshop: models.Workshop) -> List[models.ProcessEdge]:
    # Связи тянем отдельным запросом (ProcessEdge не имеет relationship back-populate).
    return (
        workshop._sa_instance_state.session.query(models.ProcessEdge)
        .filter(models.ProcessEdge.workshop_id == workshop.id)
        .all()
    )


def enterprise_to_dict(enterprise: models.Enterprise, include_children: bool = True) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "id": enterprise.id,
        "name": enterprise.name,
        "industry": enterprise.industry,
        "product_name": enterprise.product_name,
        "shift_duration_sec": enterprise.shift_duration_sec,
        "target_output": enterprise.target_output,
        "takt_time_sec": enterprise.takt_time_sec,
        "unit_price": enterprise.unit_price,
        "cost_fot": enterprise.cost_fot,
        "cost_equipment": enterprise.cost_equipment,
        "cost_overhead": enterprise.cost_overhead,
        "cost_materials": enterprise.cost_materials,
        "defect_in_flow_cost": enterprise.defect_in_flow_cost,
        "wip_start_cost": enterprise.wip_start_cost,
        "wip_end_cost": enterprise.wip_end_cost,
        "created_at_ms": enterprise.created_at_ms,
    }
    if include_children:
        data["workshops"] = [workshop_to_dict(w, include_children=True) for w in enterprise.workshops]
    return data


# ---------------------------------------------------------------------------
# Расчёты: узкое место, инфоцентр, экономика
# ---------------------------------------------------------------------------


def find_bottleneck_id(nodes: List[models.ProcessNode]) -> Optional[int]:
    ops = [n for n in nodes if n.kind == "operation"]
    if not ops:
        return None
    return max(ops, key=lambda n: n.cycle_time_sec).id


def _workshop_summary(workshop: models.Workshop, takt_time_sec: float) -> Dict[str, Any]:
    nodes = list(workshop.nodes)
    edges = _workshop_edges(workshop)
    operations = [n for n in nodes if n.kind == "operation"]

    bottleneck = max(operations, key=lambda n: n.cycle_time_sec) if operations else None
    max_cycle = bottleneck.cycle_time_sec if bottleneck else 0.0

    total_cycle = sum(n.cycle_time_sec for n in operations)
    total_transport = sum(e.transport_time_sec for e in edges)
    total_distance = round(sum(e.distance_m for e in edges), 2)

    # Загрузка по операциям (используется для тепловой карты).
    loads = [
        {
            "node_id": n.id,
            "step_number": n.step_number,
            "name": n.name,
            "cycle_time_sec": n.cycle_time_sec,
            "load_percent": round(n.cycle_time_sec / takt_time_sec * 100, 1) if takt_time_sec else 0.0,
            "is_bottleneck": bottleneck is not None and n.id == bottleneck.id,
        }
        for n in operations
    ]

    return {
        "workshop_id": workshop.id,
        "name": workshop.name,
        "is_baseline": nodes[0].is_baseline if nodes else True,
        "operations_count": len(operations),
        "max_cycle_time_sec": max_cycle,
        "bottleneck_node_id": bottleneck.id if bottleneck else None,
        "bottleneck_name": bottleneck.name if bottleneck else None,
        "total_cycle_time_sec": round(total_cycle, 1),
        "total_transport_time_sec": round(total_transport, 1),
        "total_distance_m": total_distance,
        "loads": loads,
    }


def _accepted_from_bottleneck(enterprise: models.Enterprise, bottleneck_cycle: float) -> int:
    """Фактический выпуск ограничен узким местом: floor(shift / bottleneck)."""
    if bottleneck_cycle <= 0:
        return enterprise.target_output
    return max(0, int(enterprise.shift_duration_sec // bottleneck_cycle))


def build_infocenter(db: Session, enterprise: models.Enterprise) -> Dict[str, Any]:
    """Сводка инфоцентра: берём сидированную базу (если есть) и пересчитываем экономику."""
    base = _loads(enterprise.infocenter_json, None) or seed.INFOCENTER

    workshops = list(enterprise.workshops)
    # Явно выбираем «Как есть» (все узлы is_baseline=True).
    baseline = None
    for w in workshops:
        nodes = list(w.nodes)
        if nodes and all(n.is_baseline for n in nodes):
            baseline = w
            break
    if baseline is None and workshops:
        baseline = workshops[0]

    takt = enterprise.takt_time_sec or 120.0
    bottleneck_cycle = 0.0
    if baseline is not None:
        ops = [n for n in baseline.nodes if n.kind == "operation"]
        if ops:
            bottleneck_cycle = max(n.cycle_time_sec for n in ops)

    total_cost = (
        enterprise.cost_fot
        + enterprise.cost_equipment
        + enterprise.cost_overhead
        + enterprise.cost_materials
    )
    # Каноничное (как в Инфоцентре РЦК) число принятых изделий за смену: в Раунде 1
    # из-за узкого места + брака клиенту сдаётся 2 шт. => Себестоимость = 573000/2 = 286500 ₽.
    theoretical_output = (
        int(enterprise.shift_duration_sec // bottleneck_cycle) if bottleneck_cycle > 0 else enterprise.target_output
    )
    reported_accepted = int((base.get("quality") or {}).get("accepted", 0) or 0)
    accepted = reported_accepted if reported_accepted > 0 else theoretical_output
    revenue = accepted * enterprise.unit_price
    unit_cost = round(total_cost / accepted, 2) if accepted else None
    profit = revenue - total_cost
    profit_with_defect = profit - enterprise.defect_in_flow_cost
    wip_frozen = enterprise.wip_end_cost - enterprise.wip_start_cost

    safety = base.get("safety", {"incidents": 0, "violations": 0})
    quality = dict(base.get("quality", {}))
    quality["accepted"] = accepted
    quality["produced"] = enterprise.target_output

    return {
        "enterprise_id": enterprise.id,
        "takt_time_sec": takt,
        "safety": safety,
        "quality": quality,
        "costs": {
            "total": total_cost,
            "unit_cost": unit_cost,
            "items": {
                "fot": enterprise.cost_fot,
                "equipment": enterprise.cost_equipment,
                "overhead": enterprise.cost_overhead,
                "materials": enterprise.cost_materials,
            },
            "defect_in_flow_cost": enterprise.defect_in_flow_cost,
        },
        "wip": {
            "start": enterprise.wip_start_cost,
            "end": enterprise.wip_end_cost,
            "frozen": wip_frozen,
        },
        "financial_model": {
            "accepted_output": accepted,
            "revenue": revenue,
            "total_cost": total_cost,
            "unit_cost": unit_cost,
            "profit": profit,
            "profit_with_defect": profit_with_defect,
            "bottleneck_cycle_time_sec": bottleneck_cycle,
            "theoretical_output": theoretical_output,
        },
    }


def build_dashboard(db: Session, enterprise: models.Enterprise) -> Dict[str, Any]:
    """Дашборд «До / После»: сводки по раундам + экономика + автобаланс."""
    baseline_ws = None
    after_ws = None
    for w in enterprise.workshops:
        nodes = list(w.nodes)
        if not nodes:
            continue
        if all(n.is_baseline for n in nodes):
            baseline_ws = w
        elif all(not n.is_baseline for n in nodes):
            after_ws = w

    before = _workshop_summary(baseline_ws, enterprise.takt_time_sec) if baseline_ws else None
    after = _workshop_summary(after_ws, enterprise.takt_time_sec) if after_ws else None

    return {
        "enterprise": enterprise_to_dict(enterprise, include_children=False),
        "before": before,
        "after": after,
        "infocenter": build_infocenter(db, enterprise),
        "autobalance": auto_balance_preview(enterprise),
    }


def auto_balance_preview(enterprise: models.Enterprise) -> Dict[str, Any]:
    """Предпросмотр автобалансировки: перечень изменений Раунд 1 -> Раунд 2."""
    before_by_op = {s["step"]: s["cycle"] for s in seed.STATIONS}
    after_by_op = seed.AFTER_CYCLE_BY_OP
    changes = []
    for step in sorted(before_by_op):
        b = before_by_op[step]
        a = after_by_op.get(step, b)
        changes.append(
            {
                "step_number": step,
                "before_cycle_sec": b,
                "after_cycle_sec": a,
                "delta_sec": a - b,
            }
        )
    new_max = max(after_by_op.values()) if after_by_op else 0
    old_max = max(before_by_op.values()) if before_by_op else 0
    return {
        "takt_time_sec": enterprise.takt_time_sec,
        "old_bottleneck_cycle_sec": old_max,
        "new_bottleneck_cycle_sec": new_max,
        "old_output": int(enterprise.shift_duration_sec // old_max) if old_max else 0,
        "new_output": int(enterprise.shift_duration_sec // new_max) if new_max else 0,
        "changes": changes,
    }


# ---------------------------------------------------------------------------
# Импорт / экспорт
# ---------------------------------------------------------------------------


def export_enterprise(enterprise: models.Enterprise) -> Dict[str, Any]:
    return {
        "schema": "kataxone.enterprise.v1",
        "exported_at_ms": None,
        "enterprise": enterprise_to_dict(enterprise, include_children=True),
        "infocenter": _loads(enterprise.infocenter_json, None),
    }


def import_enterprise(db: Session, payload: Dict[str, Any]) -> models.Enterprise:
    """Создаёт предприятие со всеми цехами из экспортированного JSON (без id)."""
    enterprise_data = payload.get("enterprise", payload)

    enterprise = models.Enterprise(
        name=enterprise_data.get("name", "Импортированное предприятие"),
        industry=enterprise_data.get("industry"),
        product_name=enterprise_data.get("product_name"),
        shift_duration_sec=enterprise_data.get("shift_duration_sec", 1200),
        target_output=enterprise_data.get("target_output", 10),
        unit_price=enterprise_data.get("unit_price", 70000.0),
        cost_fot=enterprise_data.get("cost_fot", 160000.0),
        cost_equipment=enterprise_data.get("cost_equipment", 153000.0),
        cost_overhead=enterprise_data.get("cost_overhead", 200000.0),
        cost_materials=enterprise_data.get("cost_materials", 60000.0),
        defect_in_flow_cost=enterprise_data.get("defect_in_flow_cost", 15000.0),
        wip_start_cost=enterprise_data.get("wip_start_cost", 71500.0),
        wip_end_cost=enterprise_data.get("wip_end_cost", 74000.0),
        infocenter_json=_dumps(payload.get("infocenter")) if payload.get("infocenter") else None,
    )
    enterprise.takt_time_sec = (
        enterprise.shift_duration_sec / enterprise.target_output
        if enterprise.target_output
        else 0.0
    )
    db.add(enterprise)
    db.flush()

    for w_data in enterprise_data.get("workshops", []):
        workshop = models.Workshop(
            enterprise_id=enterprise.id,
            name=w_data.get("name", "Цех"),
            width_m=w_data.get("width_m", 6.15),
            length_m=w_data.get("length_m", 18.40),
            table_w_m=w_data.get("table_w_m", 1.00),
            table_d_m=w_data.get("table_d_m", 0.70),
            table_h_m=w_data.get("table_h_m", 0.82),
            panorama_url=w_data.get("panorama_url"),
            explosion_diagram_url=w_data.get("explosion_diagram_url"),
        )
        db.add(workshop)
        db.flush()

        id_map: Dict[int, int] = {}
        for n_data in w_data.get("nodes", []):
            node = models.ProcessNode(
                workshop_id=workshop.id,
                step_number=n_data.get("step_number", 0),
                name=n_data.get("name", "Этап"),
                kind=n_data.get("kind", "operation"),
                cycle_time_sec=n_data.get("cycle_time_sec", 0.0),
                cost_value=n_data.get("cost", 0.0),
                operators_count=n_data.get("operators_count", 1),
                batch_size=n_data.get("batch_size", 1),
                pos_x_m=n_data.get("pos_x_m", 0.0),
                pos_y_m=n_data.get("pos_y_m", 0.0),
                tools_required_json=_dumps(n_data.get("tools_required", [])),
                excess_items_5s_json=_dumps(n_data.get("excess_items_5s", [])),
                components_json=_dumps(n_data.get("components", [])),
                standard_steps_json=_dumps(n_data.get("standard_steps", [])),
                photo_url=n_data.get("photo_url"),
                is_baseline=n_data.get("is_baseline", True),
            )
            db.add(node)
            db.flush()
            if n_data.get("id") is not None:
                id_map[n_data["id"]] = node.id

        for e_data in w_data.get("edges", []):
            src = id_map.get(e_data.get("source_node_id"))
            dst = id_map.get(e_data.get("target_node_id"))
            if src is None or dst is None:
                continue
            db.add(
                models.ProcessEdge(
                    workshop_id=workshop.id,
                    source_node_id=src,
                    target_node_id=dst,
                    transport_time_sec=e_data.get("transport_time_sec", 0.0),
                    batch_size=e_data.get("batch_size", 2),
                    distance_m=e_data.get("distance_m", 0.0),
                    is_baseline=e_data.get("is_baseline", True),
                )
            )

        for p_data in w_data.get("pois", []):
            db.add(
                models.POIMarker(
                    workshop_id=workshop.id,
                    node_id=id_map.get(p_data.get("node_id")) if p_data.get("node_id") else None,
                    pitch=p_data.get("pitch", 0.0),
                    yaw=p_data.get("yaw", 0.0),
                    title=p_data.get("title", "POI"),
                    case_problem=p_data.get("case_problem"),
                    case_solution=p_data.get("case_solution"),
                    metric_before=p_data.get("metric_before"),
                    metric_after=p_data.get("metric_after"),
                    media_url=p_data.get("media_url"),
                    is_baseline=p_data.get("is_baseline", True),
                )
            )

    db.commit()
    db.refresh(enterprise)
    return enterprise
