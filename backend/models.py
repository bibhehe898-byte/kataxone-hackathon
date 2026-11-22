from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    """Пользователь платформы (авторизация). Оставлен для обратной совместимости."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

    flows = relationship("Flow", back_populates="owner", cascade="all, delete-orphan")


class Flow(Base):
    """Legacy-хранилище графов КПСЦ (цеха одним JSON-блобом).

    Сохранено, чтобы существующие эндпоинты /api/workshops продолжали работать,
    пока UI редактора КПСЦ не будет перенесён на новую модель.
    """

    __tablename__ = "flows"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    workshop_data = Column(Text, nullable=False)

    owner = relationship("User", back_populates="flows")


class Enterprise(Base):
    """Предприятие / проект (мультипроектная SaaS-сущность).

    Экономические параметры смены, вычисляемая такт-время и финансовые словари
    инфоцентра хранятся прямо здесь.
    """

    __tablename__ = "enterprises"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    industry = Column(String, nullable=True)
    product_name = Column(String, nullable=True)

    # --- Параметры смены ---
    shift_duration_sec = Column(Integer, default=1200, nullable=False)  # 20 мин
    target_output = Column(Integer, default=10, nullable=False)  # 10 шт.
    # Вычисляемое такт-время = shift_duration_sec / target_output (хранится денормализованно).
    takt_time_sec = Column(Float, default=120.0, nullable=False)

    # --- Экономика (по умолчанию — значения пилотного кейса VENIO-C) ---
    unit_price = Column(Float, default=70000.0, nullable=False)  # цена принятого изделия
    cost_fot = Column(Float, default=160000.0, nullable=False)  # ФОТ производственного персонала
    cost_equipment = Column(Float, default=153000.0, nullable=False)  # оборудование и аренда
    cost_overhead = Column(Float, default=200000.0, nullable=False)  # общехозяйственные расходы
    cost_materials = Column(Float, default=60000.0, nullable=False)  # материалы
    defect_in_flow_cost = Column(Float, default=15000.0, nullable=False)  # брак, оставленный в потоке
    wip_start_cost = Column(Float, default=71500.0, nullable=False)  # НЗП на начало смены
    wip_end_cost = Column(Float, default=74000.0, nullable=False)  # НЗП на конец смены

    # --- Инфоцентр РЦК (денормализованная сводка, JSON-строки) ---
    # infocenter = {
    #   "safety": {"incidents": 0, "violations": 0},
    #   "quality": {"first_pass_yield": 33.0, "defects": 0, "accepted": 3, "produced": 10},
    #   "costs": {"total": 573000, "unit_cost": 286500, "items": {...}},
    #   "wip": {"start": 71500, "end": 74000, "frozen": 2500},
    # }
    infocenter_json = Column(Text, nullable=True)

    created_at_ms = Column(Integer, nullable=True)

    workshops = relationship(
        "Workshop",
        back_populates="enterprise",
        cascade="all, delete-orphan",
        order_by="Workshop.id",
    )


class Workshop(Base):
    """Цех / помещение предприятия с геометрией зала и ссылками на панораму."""

    __tablename__ = "workshops3d"

    id = Column(Integer, primary_key=True, index=True)
    enterprise_id = Column(Integer, ForeignKey("enterprises.id"), nullable=False)
    name = Column(String, nullable=False)

    width_m = Column(Float, default=6.15, nullable=False)
    length_m = Column(Float, default=18.40, nullable=False)
    table_w_m = Column(Float, default=1.00, nullable=False)
    table_d_m = Column(Float, default=0.70, nullable=False)
    table_h_m = Column(Float, default=0.82, nullable=False)

    panorama_url = Column(String, nullable=True)
    explosion_diagram_url = Column(String, nullable=True)

    enterprise = relationship("Enterprise", back_populates="workshops")
    nodes = relationship(
        "ProcessNode",
        back_populates="workshop",
        cascade="all, delete-orphan",
        order_by="ProcessNode.id",
    )
    pois = relationship(
        "POIMarker",
        back_populates="workshop",
        cascade="all, delete-orphan",
        order_by="POIMarker.id",
    )


class ProcessNode(Base):
    """Этап / рабочее место (стол оператора, склад, клиент, ОТК и т.д.).

    `is_baseline = True` — Раунд 1 «Как есть», `False` — Раунд 2 «Как будет».
    Балансировка выполняется сдвигом компонентов между операциями (не масштабированием).
    """

    __tablename__ = "process_nodes"

    id = Column(Integer, primary_key=True, index=True)
    workshop_id = Column(Integer, ForeignKey("workshops3d.id"), nullable=False)

    step_number = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    kind = Column(String, default="operation", nullable=False)  # operation / warehouse / client / control
    cycle_time_sec = Column(Float, default=0.0, nullable=False)
    operators_count = Column(Integer, default=1, nullable=False)
    batch_size = Column(Integer, default=1, nullable=False)

    pos_x_m = Column(Float, default=0.0, nullable=False)
    pos_y_m = Column(Float, default=0.0, nullable=False)

    # JSON-строки (SQLite хранит их как Text)
    tools_required_json = Column(Text, nullable=True)
    excess_items_5s_json = Column(Text, nullable=True)
    components_json = Column(Text, nullable=True)
    standard_steps_json = Column(Text, nullable=True)

    photo_url = Column(String, nullable=True)
    is_baseline = Column(Boolean, default=True, nullable=False)

    workshop = relationship("Workshop", back_populates="nodes")
    pois = relationship("POIMarker", back_populates="node")


class ProcessEdge(Base):
    """Связь / маршрут логиста между рабочими местами."""

    __tablename__ = "process_edges"

    id = Column(Integer, primary_key=True, index=True)
    workshop_id = Column(Integer, ForeignKey("workshops3d.id"), nullable=False)
    source_node_id = Column(Integer, ForeignKey("process_nodes.id"), nullable=False)
    target_node_id = Column(Integer, ForeignKey("process_nodes.id"), nullable=False)

    transport_time_sec = Column(Float, default=0.0, nullable=False)
    batch_size = Column(Integer, default=2, nullable=False)
    distance_m = Column(Float, default=0.0, nullable=False)
    is_baseline = Column(Boolean, default=True, nullable=False)

    source_node = relationship("ProcessNode", foreign_keys=[source_node_id])
    target_node = relationship("ProcessNode", foreign_keys=[target_node_id])


class POIMarker(Base):
    """Точка интереса (POI) для 360°-панорамы и 3D-тура."""

    __tablename__ = "poi_markers"

    id = Column(Integer, primary_key=True, index=True)
    workshop_id = Column(Integer, ForeignKey("workshops3d.id"), nullable=False)
    node_id = Column(Integer, ForeignKey("process_nodes.id"), nullable=True)

    pitch = Column(Float, default=0.0, nullable=False)
    yaw = Column(Float, default=0.0, nullable=False)
    title = Column(String, nullable=False)

    case_problem = Column(Text, nullable=True)
    case_solution = Column(Text, nullable=True)
    metric_before = Column(Text, nullable=True)
    metric_after = Column(Text, nullable=True)

    media_url = Column(String, nullable=True)
    is_baseline = Column(Boolean, default=True, nullable=False)

    workshop = relationship("Workshop", back_populates="pois")
    node = relationship("ProcessNode", back_populates="pois")
