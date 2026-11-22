import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from . import models, schemas, seed, services
from .database import (
    SCHEMA_VERSION,
    SessionLocal,
    UPLOADS_DIR as PUBLIC_UPLOADS_DIR,
    engine,
    get_db,
    get_stored_schema_version,
    set_stored_schema_version,
)

# ---------------------------------------------------------------------------
# Инициализация схемы БД + миграции
# ---------------------------------------------------------------------------
models.Base.metadata.create_all(bind=engine)

# Legacy-миграция: старая таблица flows имела колонки view_name/nodes_json/edges_json.
inspector = inspect(engine)
if inspector.has_table("flows"):
    columns = {column["name"] for column in inspector.get_columns("flows")}
    if "workshop_data" not in columns:
        models.Flow.__table__.drop(engine, checkfirst=True)
        models.Flow.__table__.create(engine)

# Версионная миграция «проектных» таблиц. При рассинхроне версий схемы
# пересоздаём таблицы предприятий/цехов/узлов — данные восстанавливаются Auto-Seed.
if get_stored_schema_version() != SCHEMA_VERSION:
    models.ProcessEdge.__table__.drop(engine, checkfirst=True)
    models.POIMarker.__table__.drop(engine, checkfirst=True)
    models.ProcessNode.__table__.drop(engine, checkfirst=True)
    models.Workshop.__table__.drop(engine, checkfirst=True)
    models.Enterprise.__table__.drop(engine, checkfirst=True)
    models.Base.metadata.create_all(bind=engine)
    set_stored_schema_version(SCHEMA_VERSION)

# ---------------------------------------------------------------------------
# Статика и пользовательские загрузки (360°-панорамы, планы, фото рабочих мест)
# ---------------------------------------------------------------------------
# Абсолютные пути не зависят от рабочей директории процесса uvicorn.
STATIC_DIR = Path(__file__).resolve().parent / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"  # backend/static/uploads
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Легаси-каталог <repo>/public/uploads: раньше сюда писал /api/upload, а фронтенд
# запрашивал файл у бэкенда (/static/uploads/...) и получал 404. Копируем уже
# загруженные файлы в статику, чтобы сохранённые ссылки продолжили работать.
LEGACY_UPLOADS_DIR = Path(PUBLIC_UPLOADS_DIR)


def _migrate_legacy_uploads() -> None:
    if not LEGACY_UPLOADS_DIR.is_dir():
        return
    for legacy_file in LEGACY_UPLOADS_DIR.iterdir():
        target = UPLOADS_DIR / legacy_file.name
        if legacy_file.is_file() and not target.exists():
            shutil.copy2(legacy_file, target)


_migrate_legacy_uploads()

app = FastAPI(title="Kataxone Enterprise Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Auto-Seed пилотного кейса «Фабрика процессов (РЦК Башкортостан) — VENIO-C»."""
    db = SessionLocal()
    try:
        seed.seed_pilot(db)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Настройки безопасности (legacy — оставлены для совместимости с UI редактора)
# ---------------------------------------------------------------------------
SECRET_KEY = "CHANGE_ME_IN_PRODUCTION_USE_ENV"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 часа

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": int(time.time()) + ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


# ---------------------------------------------------------------------------
# Служебные эндпоинты
# ---------------------------------------------------------------------------


@app.get("/")
def root():
    return {"service": "Kataxone Enterprise Backend", "version": "2.0.0", "status": "ok"}


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    enterprises = db.query(models.Enterprise).count()
    return {"status": "ok", "enterprises": enterprises, "schema_version": SCHEMA_VERSION}


# ---------------------------------------------------------------------------
# Авторизация (legacy)
# ---------------------------------------------------------------------------


@app.post("/api/register", status_code=status.HTTP_201_CREATED)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже существует")

    user = models.User(
        username=user_data.username,
        password_hash=hash_password(user_data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.username)
    return {"access_token": token, "token_type": "bearer", "username": user.username}


@app.post("/api/login")
def login(user_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == user_data.username).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
        )

    token = create_access_token(user.username)
    return {"access_token": token, "token_type": "bearer", "username": user.username}


# ---------------------------------------------------------------------------
# Legacy-сохранение графов КПСЦ (Редактор)
# ---------------------------------------------------------------------------


@app.get("/api/workshops")
def get_legacy_workshops(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = db.query(models.Flow).filter(models.Flow.user_id == current_user.id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Цеха не найдены")

    return json.loads(flow.workshop_data)


def _as_float(value, default=0.0):
    """Безопасное приведение к float (значения из JSON могут приходить строками)."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _legacy_db_id(node_id, prefix):
    """Возвращает int id, если id редактора имеет вид '<prefix><int>' (например n-3, ws-1)."""
    if not isinstance(node_id, str) or not node_id.startswith(prefix):
        return None
    raw = node_id[len(prefix):]
    return int(raw) if raw.isdigit() else None


def _sync_legacy_to_process(db: Session, workshops) -> None:
    """Переносит правки из legacy-графа Редактора в process_nodes/process_edges.

    - этапы с id `n-<id>` (пришедшие из process_nodes) — обновляются;
    - этапы с id `step-<uuid>` (новые в редакторе) — создаются в БД;
    - связи — создаются, если отсутствуют, иначе обновляется время транспортировки;
    - удалённые в редакторе этапы — удаляются из БД (кроме склада/клиента).
    """
    for ws in workshops or []:
        ws_id = _legacy_db_id(ws.get("id"), prefix="ws-")
        if ws_id is None:
            continue
        workshop = db.query(models.Workshop).filter(models.Workshop.id == ws_id).first()
        if not workshop:
            continue

        existing_nodes = (
            db.query(models.ProcessNode)
            .filter(models.ProcessNode.workshop_id == workshop.id)
            .all()
        )
        max_step = max(
            (n.step_number for n in existing_nodes if n.kind in ("operation", "control")),
            default=0,
        )
        baseline_flag = existing_nodes[0].is_baseline if existing_nodes else True

        # id редактора -> id в process_nodes
        editor_to_db = {}
        for node in ws.get("nodes") or []:
            node_id = node.get("id")
            data = node.get("data") or {}
            db_id = _legacy_db_id(node_id, prefix="n-")

            if db_id is not None:
                pn = db.query(models.ProcessNode).filter(
                    models.ProcessNode.id == db_id,
                    models.ProcessNode.workshop_id == workshop.id,
                ).first()
                if not pn:
                    continue
                label = data.get("label")
                if isinstance(label, str) and label.strip():
                    pn.name = label.strip()
                if data.get("cycleTime") is not None:
                    pn.cycle_time_sec = _as_float(data.get("cycleTime"))
                if data.get("cost") is not None:
                    pn.cost_value = _as_float(data.get("cost"))
                editor_to_db[node_id] = pn.id
                continue

            # Новый этап из редактора (id вида step-<uuid>): создаём process_node.
            if isinstance(node_id, str) and node_id.startswith("step-"):
                position = node.get("position") or {}
                raw_name = data.get("label")
                name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else "Новый этап"
                max_step += 1
                new_node = models.ProcessNode(
                    workshop_id=workshop.id,
                    step_number=max_step,
                    name=name,
                    kind=data.get("kind") or "operation",
                    cycle_time_sec=_as_float(data.get("cycleTime")),
                    cost_value=_as_float(data.get("cost")),
                    pos_x_m=_as_float(position.get("x")),
                    pos_y_m=_as_float(position.get("y")),
                    is_baseline=baseline_flag,
                )
                db.add(new_node)
                db.flush()
                editor_to_db[node_id] = new_node.id

        # Связи: создаём отсутствующие, обновляем время транспортировки у существующих.
        for edge in ws.get("edges") or []:
            src = editor_to_db.get(edge.get("source"))
            dst = editor_to_db.get(edge.get("target"))
            if src is None or dst is None:
                continue
            has_transport = edge.get("transport_time_sec", edge.get("transportTime")) is not None
            transport = _as_float(edge.get("transport_time_sec", edge.get("transportTime")))
            pe = db.query(models.ProcessEdge).filter(
                models.ProcessEdge.workshop_id == workshop.id,
                models.ProcessEdge.source_node_id == src,
                models.ProcessEdge.target_node_id == dst,
            ).first()
            if pe:
                if has_transport:
                    pe.transport_time_sec = transport
                continue
            db.add(
                models.ProcessEdge(
                    workshop_id=workshop.id,
                    source_node_id=src,
                    target_node_id=dst,
                    transport_time_sec=transport,
                    batch_size=edge.get("batch_size", 2),
                    is_baseline=baseline_flag,
                )
            )

        # Удаляем этапы (operation/control), которые пользователь удалил в редакторе:
        # их нет в пришедшем JSON. Склад/клиент не трогаем — редактор их не присылает.
        present_ids = set(editor_to_db.values())
        if present_ids:
            for old_node in existing_nodes:
                if old_node.kind not in ("operation", "control"):
                    continue
                if old_node.id in present_ids:
                    continue
                db.query(models.ProcessEdge).filter(
                    (models.ProcessEdge.source_node_id == old_node.id)
                    | (models.ProcessEdge.target_node_id == old_node.id)
                ).delete(synchronize_session=False)
                db.delete(old_node)


@app.post("/api/workshops")
def save_legacy_workshops(
    flow_data: schemas.FlowSave,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    flow = db.query(models.Flow).filter(models.Flow.user_id == current_user.id).first()
    workshop_data = json.dumps(flow_data.workshops, ensure_ascii=False)

    if flow:
        flow.workshop_data = workshop_data
    else:
        flow = models.Flow(user_id=current_user.id, workshop_data=workshop_data)
        db.add(flow)

    # Синхронизируем изменения этапов/связей в актуальные таблицы process_nodes/process_edges,
    # а не просто возвращаем 200 OK: иначе время цикла и прочие характеристики
    # не попадали бы в Дашборд и 3D-тур.
    _sync_legacy_to_process(db, flow_data.workshops)

    db.commit()
    db.refresh(flow)
    return {"saved": True}


# ---------------------------------------------------------------------------
# Предприятия / проекты
# ---------------------------------------------------------------------------


@app.get("/api/enterprises")
def list_enterprises(db: Session = Depends(get_db)):
    enterprises = db.query(models.Enterprise).order_by(models.Enterprise.id).all()
    return [services.enterprise_to_dict(e, include_children=False) for e in enterprises]


@app.post("/api/enterprises", status_code=status.HTTP_201_CREATED)
def create_enterprise(data: schemas.EnterpriseCreate, db: Session = Depends(get_db)):
    enterprise = models.Enterprise(
        name=data.name,
        industry=data.industry,
        product_name=data.product_name,
        shift_duration_sec=data.shift_duration_sec,
        target_output=data.target_output,
        unit_price=data.unit_price,
        cost_fot=data.cost_fot,
        cost_equipment=data.cost_equipment,
        cost_overhead=data.cost_overhead,
        cost_materials=data.cost_materials,
        defect_in_flow_cost=data.defect_in_flow_cost,
        wip_start_cost=data.wip_start_cost,
        wip_end_cost=data.wip_end_cost,
        created_at_ms=int(time.time() * 1000),
    )
    enterprise.takt_time_sec = (
        data.shift_duration_sec / data.target_output if data.target_output else 0.0
    )
    db.add(enterprise)
    db.commit()
    db.refresh(enterprise)
    return services.enterprise_to_dict(enterprise, include_children=False)


@app.get("/api/enterprises/{enterprise_id}")
def get_enterprise(enterprise_id: int, db: Session = Depends(get_db)):
    enterprise = db.query(models.Enterprise).filter(models.Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Предприятие не найдено")
    return services.enterprise_to_dict(enterprise, include_children=True)


@app.put("/api/enterprises/{enterprise_id}")
def update_enterprise(
    enterprise_id: int, data: schemas.EnterpriseUpdate, db: Session = Depends(get_db)
):
    enterprise = db.query(models.Enterprise).filter(models.Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Предприятие не найдено")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(enterprise, field, value)

    if enterprise.target_output:
        enterprise.takt_time_sec = enterprise.shift_duration_sec / enterprise.target_output

    db.commit()
    db.refresh(enterprise)
    return services.enterprise_to_dict(enterprise, include_children=False)


@app.delete("/api/enterprises/{enterprise_id}")
def delete_enterprise(enterprise_id: int, db: Session = Depends(get_db)):
    enterprise = db.query(models.Enterprise).filter(models.Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Предприятие не найдено")
    db.delete(enterprise)
    db.commit()
    return {"deleted": True, "id": enterprise_id}


@app.get("/api/enterprises/{enterprise_id}/export")
def export_enterprise(enterprise_id: int, db: Session = Depends(get_db)):
    enterprise = db.query(models.Enterprise).filter(models.Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Предприятие не найдено")
    payload = services.export_enterprise(enterprise)
    payload["exported_at_ms"] = int(time.time() * 1000)
    return payload


@app.post("/api/enterprises/import", status_code=status.HTTP_201_CREATED)
def import_enterprise(payload: dict, db: Session = Depends(get_db)):
    enterprise = services.import_enterprise(db, payload)
    return services.enterprise_to_dict(enterprise, include_children=False)


@app.get("/api/enterprises/{enterprise_id}/infocenter")
def enterprise_infocenter(enterprise_id: int, db: Session = Depends(get_db)):
    enterprise = db.query(models.Enterprise).filter(models.Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Предприятие не найдено")
    return services.build_infocenter(db, enterprise)


@app.get("/api/enterprises/{enterprise_id}/dashboard")
def enterprise_dashboard(enterprise_id: int, db: Session = Depends(get_db)):
    enterprise = db.query(models.Enterprise).filter(models.Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Предприятие не найдено")
    return services.build_dashboard(db, enterprise)


@app.post("/api/enterprises/{enterprise_id}/autobalance")
def enterprise_autobalance(enterprise_id: int, db: Session = Depends(get_db)):
    enterprise = db.query(models.Enterprise).filter(models.Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Предприятие не найдено")
    return services.auto_balance_preview(enterprise)


# ---------------------------------------------------------------------------
# Цеха, рабочие места, связи, POI
# ---------------------------------------------------------------------------


def _get_workshop_or_404(db: Session, workshop_id: int) -> models.Workshop:
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Цех не найден")
    return workshop


@app.get("/api/workshops/{workshop_id}")
def get_workshop(workshop_id: int, db: Session = Depends(get_db)):
    workshop = _get_workshop_or_404(db, workshop_id)
    return services.workshop_to_dict(workshop, include_children=True)


@app.get("/api/workshops/{workshop_id}/nodes")
def get_workshop_nodes(workshop_id: int, db: Session = Depends(get_db)):
    workshop = _get_workshop_or_404(db, workshop_id)
    takt = workshop.enterprise.takt_time_sec
    nodes = list(workshop.nodes)
    bottleneck_id = services.find_bottleneck_id(nodes)
    return [services.node_to_dict(n, takt, bottleneck_id) for n in nodes]


@app.post("/api/workshops/{workshop_id}/nodes", status_code=status.HTTP_201_CREATED)
def create_workshop_node(
    workshop_id: int, data: schemas.ProcessNodeCreate, db: Session = Depends(get_db)
):
    workshop = _get_workshop_or_404(db, workshop_id)
    node = models.ProcessNode(
        workshop_id=workshop.id,
        step_number=data.step_number,
        name=data.name,
        kind=data.kind,
        cycle_time_sec=data.cycle_time_sec,
        cost_value=data.cost,
        operators_count=data.operators_count,
        batch_size=data.batch_size,
        pos_x_m=data.pos_x_m,
        pos_y_m=data.pos_y_m,
        tools_required_json=services._dumps(data.tools_required),
        excess_items_5s_json=services._dumps(data.excess_items_5s),
        components_json=services._dumps(data.components),
        standard_steps_json=services._dumps(data.standard_steps),
        photo_url=data.photo_url,
        is_baseline=data.is_baseline,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return services.node_to_dict(node, workshop.enterprise.takt_time_sec, None)


@app.get("/api/workshops/{workshop_id}/edges")
def get_workshop_edges(workshop_id: int, db: Session = Depends(get_db)):
    _get_workshop_or_404(db, workshop_id)
    edges = (
        db.query(models.ProcessEdge)
        .filter(models.ProcessEdge.workshop_id == workshop_id)
        .order_by(models.ProcessEdge.id)
        .all()
    )
    return [services.edge_to_dict(e) for e in edges]


@app.post("/api/workshops/{workshop_id}/edges", status_code=status.HTTP_201_CREATED)
def create_workshop_edge(
    workshop_id: int, data: schemas.ProcessEdgeCreate, db: Session = Depends(get_db)
):
    _get_workshop_or_404(db, workshop_id)
    edge = models.ProcessEdge(
        workshop_id=workshop_id,
        source_node_id=data.source_node_id,
        target_node_id=data.target_node_id,
        transport_time_sec=data.transport_time_sec,
        batch_size=data.batch_size,
        distance_m=data.distance_m,
        is_baseline=data.is_baseline,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return services.edge_to_dict(edge)


@app.get("/api/workshops/{workshop_id}/pois")
def get_workshop_pois(workshop_id: int, db: Session = Depends(get_db)):
    _get_workshop_or_404(db, workshop_id)
    pois = (
        db.query(models.POIMarker)
        .filter(models.POIMarker.workshop_id == workshop_id)
        .order_by(models.POIMarker.id)
        .all()
    )
    return [services.poi_to_dict(p) for p in pois]


@app.post("/api/workshops/{workshop_id}/pois", status_code=status.HTTP_201_CREATED)
def create_workshop_poi(
    workshop_id: int, data: schemas.POICreate, db: Session = Depends(get_db)
):
    _get_workshop_or_404(db, workshop_id)
    poi = models.POIMarker(
        workshop_id=workshop_id,
        node_id=data.node_id,
        pitch=data.pitch,
        yaw=data.yaw,
        title=data.title,
        case_problem=data.case_problem,
        case_solution=data.case_solution,
        metric_before=data.metric_before,
        metric_after=data.metric_after,
        media_url=data.media_url,
        is_baseline=data.is_baseline,
    )
    db.add(poi)
    db.commit()
    db.refresh(poi)
    return services.poi_to_dict(poi)


# ---------------------------------------------------------------------------
# Загрузка файлов (360°-панорамы, планы цеха, фото рабочих мест)
# ---------------------------------------------------------------------------


PANORAMA_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


@app.post("/api/upload/panorama")
async def upload_panorama(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in PANORAMA_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый тип файла: {suffix or 'без расширения'}",
        )
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (лимит 25 МБ)")

    unique_filename = f"{uuid.uuid4().hex}{suffix}"
    # Папку создаём и перед записью: её могли удалить при работающем сервере.
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    (UPLOADS_DIR / unique_filename).write_bytes(content)

    # Путь всегда начинается с /static/uploads/ и отдаётся StaticFiles-маунтом.
    # Фронтенд добавляет origin бэкенда (http://127.0.0.1:8000).
    return {
        "url": f"/static/uploads/{unique_filename}",
        "filename": unique_filename,
        "original_name": file.filename,
        "size": len(content),
    }


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
# Алиас для легаси-ссылок /uploads/<name> (этот префикс проксирует Vite),
# чтобы старые относительные пути тоже открывались, а не давали 404.
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.post("/api/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
    if suffix not in allowed:
        raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {suffix or 'без расширения'}")

    unique_name = f"{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (лимит 25 МБ)")

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    (UPLOADS_DIR / unique_name).write_bytes(content)

    # Тот же каталог, который отдаёт StaticFiles: /static/uploads/<name>.
    return {
        "url": f"/static/uploads/{unique_name}",
        "filename": unique_name,
        "original_name": file.filename,
        "size": len(content),
    }
