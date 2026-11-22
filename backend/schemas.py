"""Pydantic-схемы (v2) для мультипроектного API Kataxone Enterprise.

Схемы описывают «плоские» JSON-контракты, которые отдаёт FastAPI: вложенные
JSON-поля моделей (tools_required, components, ...) представлены Python-списками.
"""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Legacy (авторизация + сохранение графов КПСЦ)
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    username: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class FlowSave(BaseModel):
    workshops: list[dict]


# ---------------------------------------------------------------------------
# Инфоцентр РЦК
# ---------------------------------------------------------------------------


class InfocenterSafety(BaseModel):
    incidents: int = 0
    violations: int = 0
    note: Optional[str] = None


class InfocenterQuality(BaseModel):
    first_pass_yield: float = 0.0  # %, например 33
    defects: int = 0
    accepted: int = 0
    produced: int = 0
    note: Optional[str] = None


class InfocenterCosts(BaseModel):
    total: float = 0.0
    unit_cost: float = 0.0
    items: dict = Field(default_factory=dict)
    note: Optional[str] = None


class InfocenterWIP(BaseModel):
    start: float = 0.0
    end: float = 0.0
    frozen: float = 0.0
    note: Optional[str] = None


class Infocenter(BaseModel):
    safety: InfocenterSafety = Field(default_factory=InfocenterSafety)
    quality: InfocenterQuality = Field(default_factory=InfocenterQuality)
    costs: InfocenterCosts = Field(default_factory=InfocenterCosts)
    wip: InfocenterWIP = Field(default_factory=InfocenterWIP)


# ---------------------------------------------------------------------------
# Предприятие
# ---------------------------------------------------------------------------


class EnterpriseCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    product_name: Optional[str] = None
    shift_duration_sec: int = 1200
    target_output: int = 10
    unit_price: float = 70000.0
    cost_fot: float = 160000.0
    cost_equipment: float = 153000.0
    cost_overhead: float = 200000.0
    cost_materials: float = 60000.0
    defect_in_flow_cost: float = 15000.0
    wip_start_cost: float = 71500.0
    wip_end_cost: float = 74000.0


class EnterpriseUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    product_name: Optional[str] = None
    shift_duration_sec: Optional[int] = None
    target_output: Optional[int] = None
    unit_price: Optional[float] = None
    cost_fot: Optional[float] = None
    cost_equipment: Optional[float] = None
    cost_overhead: Optional[float] = None
    cost_materials: Optional[float] = None
    defect_in_flow_cost: Optional[float] = None
    wip_start_cost: Optional[float] = None
    wip_end_cost: Optional[float] = None


class EnterpriseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    industry: Optional[str] = None
    product_name: Optional[str] = None
    shift_duration_sec: int
    target_output: int
    takt_time_sec: float
    unit_price: float
    cost_fot: float
    cost_equipment: float
    cost_overhead: float
    cost_materials: float
    defect_in_flow_cost: float
    wip_start_cost: float
    wip_end_cost: float
    created_at_ms: Optional[int] = None


# ---------------------------------------------------------------------------
# Цех
# ---------------------------------------------------------------------------


class WorkshopCreate(BaseModel):
    name: str
    width_m: float = 6.15
    length_m: float = 18.40
    table_w_m: float = 1.00
    table_d_m: float = 0.70
    table_h_m: float = 0.82
    panorama_url: Optional[str] = None
    explosion_diagram_url: Optional[str] = None


class WorkshopOut(WorkshopCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    enterprise_id: int


# ---------------------------------------------------------------------------
# Рабочее место (этап)
# ---------------------------------------------------------------------------


class ProcessNodeCreate(BaseModel):
    step_number: int
    name: str
    kind: str = "operation"  # operation / warehouse / client / control
    cycle_time_sec: float = 0.0
    cost: float = 0.0
    operators_count: int = 1
    batch_size: int = 1
    pos_x_m: float = 0.0
    pos_y_m: float = 0.0
    tools_required: List[str] = Field(default_factory=list)
    excess_items_5s: List[str] = Field(default_factory=list)
    components: List[str] = Field(default_factory=list)
    standard_steps: List[str] = Field(default_factory=list)
    photo_url: Optional[str] = None
    is_baseline: bool = True


class ProcessNodeOut(BaseModel):
    id: int
    workshop_id: int
    step_number: int
    name: str
    kind: str
    cycle_time_sec: float
    cost: float = 0.0
    operators_count: int
    batch_size: int
    pos_x_m: float
    pos_y_m: float
    tools_required: List[str] = Field(default_factory=list)
    excess_items_5s: List[str] = Field(default_factory=list)
    components: List[str] = Field(default_factory=list)
    standard_steps: List[str] = Field(default_factory=list)
    photo_url: Optional[str] = None
    is_baseline: bool = True
    # вычисляемое значение (cycle_time_sec / takt_time_sec * 100)
    load_percent: Optional[float] = None
    is_bottleneck: bool = False


# ---------------------------------------------------------------------------
# Связь / маршрут логиста
# ---------------------------------------------------------------------------


class ProcessEdgeCreate(BaseModel):
    source_node_id: int
    target_node_id: int
    transport_time_sec: float = 0.0
    batch_size: int = 2
    distance_m: float = 0.0
    is_baseline: bool = True


class ProcessEdgeOut(BaseModel):
    id: int
    workshop_id: int
    source_node_id: int
    target_node_id: int
    transport_time_sec: float
    batch_size: int
    distance_m: float
    is_baseline: bool = True


# ---------------------------------------------------------------------------
# POI (точки интереса 360°/3D)
# ---------------------------------------------------------------------------


class POICreate(BaseModel):
    node_id: Optional[int] = None
    pitch: float = 0.0
    yaw: float = 0.0
    title: str
    case_problem: Optional[str] = None
    case_solution: Optional[str] = None
    metric_before: Optional[str] = None
    metric_after: Optional[str] = None
    media_url: Optional[str] = None
    is_baseline: bool = True


class POIOut(POICreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workshop_id: int
    node_id: Optional[int] = None
    title: str
