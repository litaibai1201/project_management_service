# -*- coding: utf-8 -*-
"""日报接口测试 — /api/daily_log"""
import pytest
from tests.conftest import json_post, json_get, json_put


def create_log(client, token, **overrides):
    """辅助：创建一条日报，返回 log_id"""
    payload = {
        "work_no": "T001",
        "log_date": "2026-05-19",
        "log_status": 1,
        "entries": [],
    }
    payload.update(overrides)
    resp = json_post(client, "/api/daily_log", payload, token=token)
    data = resp.get_json()
    return data.get("content", {}).get("id") or data.get("content", {}).get("log_id")


class TestDailyLogCRUD:
    """日报增删改查"""

    def test_create_log(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/daily_log", {
                "work_no": "T001",
                "log_date": "2026-05-19",
                "log_status": 1,
                "entries": [],
            }, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_log_missing_date(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/daily_log",
                             {"work_no": "T001", "entries": []},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_list_logs(self, client, auth_token, app):
        with app.app_context():
            create_log(client, auth_token)
            resp = json_get(client, "/api/daily_log", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "list" in data["content"]

    def test_list_logs_filter_by_date(self, client, auth_token, app):
        with app.app_context():
            create_log(client, auth_token, log_date="2026-05-19")
            resp = json_get(client, "/api/daily_log", token=auth_token,
                            params={"start_date": "2026-05-01", "end_date": "2026-05-31"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total"] >= 1

    def test_list_logs_filter_no_match(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/daily_log", token=auth_token,
                            params={"start_date": "2020-01-01", "end_date": "2020-01-02"})
            data = resp.get_json()
            assert data["content"]["total"] == 0

    def test_get_log_detail(self, client, auth_token, app):
        with app.app_context():
            lid = create_log(client, auth_token)
            assert lid is not None
            resp = json_get(client, f"/api/daily_log/{lid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_get_nonexistent_log(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/daily_log/ghost-log-id", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_update_log(self, client, auth_token, app):
        with app.app_context():
            lid = create_log(client, auth_token)
            resp = json_put(client, f"/api/daily_log/{lid}",
                            {"log_status": 2, "entries": []},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_update_nonexistent_log(self, client, auth_token, app):
        with app.app_context():
            resp = json_put(client, "/api/daily_log/ghost-log-id",
                            {"log_status": 2}, token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestDailyLogStatus:
    """日报状态：草稿(1) → 已提交(2)"""

    def test_submit_log(self, client, auth_token, app):
        with app.app_context():
            lid = create_log(client, auth_token, log_status=1)
            resp = json_put(client, f"/api/daily_log/{lid}",
                            {"log_status": 2}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_duplicate_log_same_date(self, client, auth_token, app):
        """同一天同一用户不能创建两条日报"""
        with app.app_context():
            create_log(client, auth_token, log_date="2026-05-20")
            resp = json_post(client, "/api/daily_log", {
                "work_no": "T001", "log_date": "2026-05-20", "log_status": 1, "entries": []
            }, token=auth_token)
            data = resp.get_json()
            # 应拒绝重复创建
            assert data["code"] != "S10000"


class TestDailyLogSuggest:
    """日报建议条目"""

    def test_suggest_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/daily_log/suggest", token=auth_token,
                            params={"date": "2026-05-19"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_suggest_without_date(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/daily_log/suggest", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestDailyLogTaskEntries:
    """任务条目查询"""

    def test_task_entries_requires_task_id(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/daily_log/task_entries", token=auth_token,
                            params={"task_type": "project"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"] == []

    def test_task_entries_with_task_id(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/daily_log/task_entries", token=auth_token,
                            params={"task_type": "project", "task_id": "some-project-id"})
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestDailyLogSyncProgress:
    """同步任务进度"""

    def test_sync_progress(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/daily_log/sync_task_progress",
                             {"task_type": "duty", "task_id": "some-id", "progress": 50},
                             token=auth_token)
            # 任务不存在时可能返回 404，但不应该是 500
            assert resp.status_code != 500

    def test_sync_progress_missing_fields(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/daily_log/sync_task_progress",
                             {"task_type": "duty"}, token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestDailyLogPagination:
    """分页测试"""

    def test_pagination_page_size(self, client, auth_token, app):
        with app.app_context():
            # 创建 3 条日报
            for i in range(1, 4):
                create_log(client, auth_token, log_date=f"2026-04-{i:02d}")
            resp = json_get(client, "/api/daily_log", token=auth_token,
                            params={"page": 1, "size": 2})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert len(data["content"]["list"]) <= 2

    def test_pagination_second_page(self, client, auth_token, app):
        with app.app_context():
            for i in range(1, 4):
                create_log(client, auth_token, log_date=f"2026-03-{i:02d}")
            resp = json_get(client, "/api/daily_log", token=auth_token,
                            params={"page": 2, "size": 2})
            data = resp.get_json()
            assert data["code"] == "S10000"
