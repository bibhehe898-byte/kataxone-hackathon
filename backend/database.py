import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

# БД всегда создаётся в папке backend, независимо от того, откуда запущен uvicorn.
# KATAXONE_DB_PATH позволяет тестам (scripts/verify_backend.py) использовать
# изолированную временную БД и не засорять рабочий backend/kataxone.db.
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("KATAXONE_DB_PATH", BASE_DIR / "kataxone.db"))
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# Папка для пользовательских 360°-панорам, планов и фото рабочих мест.
# Абсолютный путь: <repo>/public/uploads (совпадает с .gitignore/.rooignore).
PUBLIC_DIR = BASE_DIR.parent / "public"
UPLOADS_DIR = PUBLIC_DIR / "uploads"

# Версия схемы данных. При несовпадении со значением в БД пересоздаём
# «проектные» таблицы (enterprises/workshops3d/process_nodes/...). Это безопасно:
# пилотный кейс и любые тестовые данные восстанавливаются Auto-Seed на старте.
SCHEMA_VERSION = 1

# check_same_thread=False обязателен для SQLite в связке с FastAPI (thread pool).
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_stored_schema_version() -> int:
    """Возвращает сохранённую версию схемы (0, если БД ещё не инициализирована).

    Используем отдельную служебную таблицу, чтобы не зависеть от наличия
    Alembic: при рассинхроне версий вызывающий код пересоздаёт таблицы.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
            ).fetchone()
            if result is None:
                return 0
            row = conn.execute(text("SELECT version FROM schema_meta LIMIT 1")).fetchone()
            return int(row[0]) if row else 0
    except Exception:
        return 0


def set_stored_schema_version(version: int) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL)")
        )
        conn.execute(text("DELETE FROM schema_meta"))
        conn.execute(text("INSERT INTO schema_meta (version) VALUES (:v)"), {"v": version})
