"""Проверка backend: импорт приложения, Auto-Seed и ключевые эндпоинты.

Запуск: python scripts/verify_backend.py
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# Корень репозитория в sys.path, чтобы импортировать пакет backend.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Изоляция БД: тесты создают предприятия/пользователей, поэтому работаем на
# временной базе. Иначе рабочий backend/kataxone.db засорялся бы дублями
# пилота и «Тестовым предприятием» при каждом запуске проверки.
_TMP_DB = Path(tempfile.gettempdir()) / f"kataxone_verify_{os.getpid()}.db"
os.environ["KATAXONE_DB_PATH"] = str(_TMP_DB)

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402


def check(condition: bool, label: str) -> None:
    status = "OK " if condition else "FAIL"
    print(f"[{status}] {label}")
    if not condition:
        raise AssertionError(label)


def main() -> None:
    with TestClient(app) as client:
        # 1. Health + Auto-Seed
        health = client.get("/api/health").json()
        check(health["status"] == "ok", f"health ok ({health})")
        check(health["enterprises"] >= 1, "auto-seed created pilot enterprise")

        # 2. Список предприятий
        enterprises = client.get("/api/enterprises").json()
        check(len(enterprises) >= 1, f"enterprises listed: {len(enterprises)}")
        pilot = next(
            (e for e in enterprises if "Фабрика процессов" in e["name"]), None
        )
        check(pilot is not None, "pilot enterprise found in list")
        check(abs(pilot["takt_time_sec"] - 120.0) < 1e-6, f"takt = {pilot['takt_time_sec']}")

        eid = pilot["id"]

        # 3. Полное дерево предприятия
        detail = client.get(f"/api/enterprises/{eid}").json()
        check(len(detail["workshops"]) == 2, f"2 workshops (Как есть/Как будет): {len(detail['workshops'])}")

        baseline = next(
            w for w in detail["workshops"]
            if all(n["is_baseline"] for n in w["nodes"])
        )
        after = next(
            w for w in detail["workshops"]
            if all(not n["is_baseline"] for n in w["nodes"])
        )

        ops = [n for n in baseline["nodes"] if n["kind"] == "operation"]
        workstations = [n for n in baseline["nodes"] if n["kind"] in ("operation", "control")]
        check(len(workstations) == 10, f"10 workstations (9 ops + ОТК) in baseline: {len(workstations)}")
        check(len(ops) == 9, f"9 operation stations in baseline: {len(ops)}")
        check(any(n["kind"] == "warehouse" for n in baseline["nodes"]), "warehouse node present")
        check(any(n["kind"] == "client" for n in baseline["nodes"]), "client zone present")

        # 4. Узкое место: Оператор №8, 171 c, 142.5%
        op8 = next(n for n in ops if n["step_number"] == 8)
        check(abs(op8["cycle_time_sec"] - 171) < 1e-6, f"Op8 cycle = {op8['cycle_time_sec']}")
        check(abs(op8["load_percent"] - 142.5) < 0.05, f"Op8 load = {op8['load_percent']}%")
        check(op8["is_bottleneck"] is True, "Op8 flagged as bottleneck")

        # 5. Инфоцентр
        info = client.get(f"/api/enterprises/{eid}/infocenter").json()
        check(info["safety"]["incidents"] == 0, "safety incidents = 0")
        check(abs(info["quality"]["first_pass_yield"] - 33.0) < 1e-6, "quality = 33%")
        check(abs(info["costs"]["total"] - 573000.0) < 1e-6, f"costs total = {info['costs']['total']}")
        check(abs(info["costs"]["unit_cost"] - 286500.0) < 1e-6, f"unit cost = {info['costs']['unit_cost']}")
        check(abs(info["wip"]["start"] - 71500.0) < 1e-6, "wip start = 71500")
        check(abs(info["wip"]["end"] - 74000.0) < 1e-6, "wip end = 74000")
        check(abs(info["wip"]["frozen"] - 2500.0) < 1e-6, "wip frozen = 2500")

        fm = info["financial_model"]
        check(fm["theoretical_output"] == 7, f"theoretical cap (floor 1200/171) = {fm['theoretical_output']}")
        check(fm["accepted_output"] == 2, f"canonical accepted = {fm['accepted_output']}")
        check(fm["profit"] == 2 * 70000.0 - 573000.0, f"profit = {fm['profit']} (-433000)")

        # 6. Дашборд До/После
        dash = client.get(f"/api/enterprises/{eid}/dashboard").json()
        check(dash["before"]["max_cycle_time_sec"] == 171.0, "dashboard before bottleneck = 171")
        check(dash["after"]["max_cycle_time_sec"] < 171.0, "after bottleneck reduced")
        check("autobalance" in dash, "autobalance preview in dashboard")

        # 7. Автобалансировка
        ab = client.post(f"/api/enterprises/{eid}/autobalance").json()
        check(ab["new_bottleneck_cycle_sec"] <= 120.0, f"balanced max cycle = {ab['new_bottleneck_cycle_sec']}")
        check(len(ab["changes"]) == 10, "10 balance changes")

        # 8. POI / связи
        pois = client.get(f"/api/workshops/{baseline['id']}/pois").json()
        check(len(pois) >= 4, f"POIs seeded: {len(pois)}")
        edges = client.get(f"/api/workshops/{baseline['id']}/edges").json()
        check(len(edges) >= 10, f"edges seeded: {len(edges)}")

        # 9. Экспорт / импорт
        export = client.get(f"/api/enterprises/{eid}/export").json()
        check(export["schema"] == "kataxone.enterprise.v1", "export schema tag")
        check(len(export["enterprise"]["workshops"]) == 2, "export contains workshops")

        imported = client.post(
            "/api/enterprises/import",
            content=json.dumps(export),
            headers={"Content-Type": "application/json"},
        )
        check(imported.status_code == 201, f"import status {imported.status_code}")
        check(imported.json()["id"] != eid, "imported as new enterprise")

        # 10. Создание предприятия + экономика
        created = client.post(
            "/api/enterprises",
            json={
                "name": "Тестовое предприятие",
                "target_output": 10,
                "shift_duration_sec": 1200,
            },
        ).json()
        check(abs(created["takt_time_sec"] - 120.0) < 1e-6, "new enterprise takt = 120")

        # 11. Legacy-эндпоинты авторизации
        client.post("/api/register", json={"username": "demo", "password": "demo123"})
        login = client.post("/api/login", json={"username": "demo", "password": "demo123"})
        check(login.status_code == 200, f"legacy login status {login.status_code}")

    print("\nALL BACKEND CHECKS PASSED")


def _cleanup() -> None:
    """Удаляем временную БД после прогона, чтобы не оставлять мусор в TEMP."""
    for suffix in ("", "-wal", "-shm"):
        try:
            Path(str(_TMP_DB) + suffix).unlink()
        except OSError:
            pass


if __name__ == "__main__":
    try:
        main()
    finally:
        _cleanup()
