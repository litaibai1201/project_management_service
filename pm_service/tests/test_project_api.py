# -*- coding: utf-8 -*-
"""项目管理接口测试 — /api/project"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


# ── 辅助：创建一个项目并返回 project_id ───────────────────────────────────────

def create_project(client, token, overrides=None):
    payload = {
        "project_nm": "测试专案",
        "project_type": "研发",
        "project_pm": "T001",
        "project_status": 1,
    }
    if overrides:
        payload.update(overrides)
    resp = client.post("/api/project/create_project",
                       data=payload,
                       headers={"Authorization": f"Bearer {token}"})
    data = resp.get_json()
    return data.get("content", {}).get("id") or data.get("content", {}).get("project_id")


class TestProjectCRUD:
    """项目增删改查"""

    def test_create_project(self, client, auth_token, app):
        with app.app_context():
            resp = client.post("/api/project/create_project",
                               data={"project_nm": "新专案", "project_type": "研发",
                                     "project_pm": "T001"},
                               headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["project_id"] is not None

    def test_create_project_requires_name(self, client, auth_token, app):
        with app.app_context():
            resp = client.post("/api/project/create_project",
                               data={"project_type": "研发"},
                               headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_list_projects(self, client, auth_token, app):
        with app.app_context():
            create_project(client, auth_token)
            resp = json_post(client, "/api/project/project_list", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "project_list" in data["content"]

    def test_list_projects_filter_by_status(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/project/project_list",
                             {"project_status": 1}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_get_project_detail(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            assert pid is not None
            resp = json_get(client, f"/api/project/{pid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["id"] == pid

    def test_get_nonexistent_project(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/project/nonexistent-id-000", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_update_project(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = client.put(f"/api/project/{pid}",
                              data={"project_nm": "更新专案名"},
                              headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_project(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_delete(client, f"/api/project/{pid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestProjectStatus:
    """项目状态流转"""

    def test_set_project_pm(self, client, auth_token, seed_user, app):
        with app.app_context():
            # Create project without project_pm, then set status to 3 (规划中)
            pid = create_project(client, auth_token, overrides={"project_pm": ""})
            json_put(client, f"/api/project/{pid}/set_status", {"status": 3}, token=auth_token)
            resp = json_put(client, f"/api/project/{pid}/set_project_pm",
                            {"project_pm": "t001"}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_set_status(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_put(client, f"/api/project/{pid}/set_status",
                            {"status": 2}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestFunctionTask:
    """WBS 功能任务 /api/project/<pid>/functions"""

    def _create_function(self, client, token, pid, **kwargs):
        # add_function requires project status 3 (规划中)
        json_put(client, f"/api/project/{pid}/set_status", {"status": 3}, token=token)
        payload = {
            "function_nm": "测试任务",
            "responsible": '["T001"]',
            "expected_end_date": "2026-12-31",
        }
        payload.update(kwargs)
        resp = client.post(f"/api/project/{pid}/add_function",
                           data=payload,
                           headers={"Authorization": f"Bearer {token}"})
        data = resp.get_json()
        return data.get("content", {}).get("function_id")

    def test_create_function(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            fid = self._create_function(client, auth_token, pid)
            assert fid is not None

    def test_list_functions(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            self._create_function(client, auth_token, pid)
            resp = json_post(client, f"/api/project/{pid}/function_list", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_get_function_detail(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            fid = self._create_function(client, auth_token, pid)
            resp = json_get(client, f"/api/project/{pid}/function/{fid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_update_function(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            fid = self._create_function(client, auth_token, pid)
            resp = client.put(f"/api/project/{pid}/function/{fid}",
                              data={"function_nm": "更新任务名"},
                              headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_function(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            fid = self._create_function(client, auth_token, pid)
            resp = json_delete(client, f"/api/project/{pid}/function/{fid}",
                               token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_function_reschedule(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            fid = self._create_function(client, auth_token, pid)
            resp = json_post(client, f"/api/project/{pid}/function/{fid}/reschedule",
                             {"new_end_date": "2027-03-31", "reason": "需求变更"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_function_progress(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            fid = self._create_function(client, auth_token, pid)
            resp = json_get(client, f"/api/project/{pid}/function/{fid}/progress",
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_function_progress(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            fid = self._create_function(client, auth_token, pid)
            resp = client.post(f"/api/project/{pid}/function/{fid}/progress",
                               data={"content": "完成了30%的工作", "progress": "30"},
                               headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestReview:
    """审核流程"""

    def test_get_all_reviews(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/project/all_reviews", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_get_my_reviews(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/project/review_list", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_get_submitted_reviews(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/project/my_submitted_reviews", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestProgressReport:
    """周报 WBS 概览"""

    def test_wbs_overview(self, client, auth_token, app):
        with app.app_context():
            pid = create_project(client, auth_token)
            resp = json_get(client, f"/api/project/{pid}/wbs_overview", token=auth_token)
            # 允许 200 或 404（空数据）
            assert resp.status_code in (200, 404)

    def test_progress_report(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/project/report_stats", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
