# -*- coding: utf-8 -*-
"""AR接口测试 — /api/temporary_duty"""
import json
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


def create_duty(client, token, **overrides):
    """辅助：创建一条草稿AR，返回 duty_id"""
    payload = {
        "duty_nm": "测试AR",
        "responsible": '["T001"]',
        "expected_start_date": "2026-01-01",
        "expected_end_date": "2026-12-31",
        "duty_type": "开发",
    }
    payload.update(overrides)
    resp = client.post("/api/temporary_duty/create_temporary_duty",
                       data=payload,
                       headers={"Authorization": f"Bearer {token}"})
    data = resp.get_json()
    return data.get("content", {}).get("id") or data.get("content", {}).get("duty_id")


class TestDutyCRUD:
    """基础增删改查"""

    def test_create_duty(self, client, auth_token, app):
        with app.app_context():
            resp = client.post("/api/temporary_duty/create_temporary_duty",
                               data={"duty_nm": "新任务", "responsible": '["T001"]',
                                     "expected_end_date": "2026-12-31"},
                               headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["duty_id"] is not None

    def test_create_duty_missing_name(self, client, auth_token, app):
        with app.app_context():
            resp = client.post("/api/temporary_duty/create_temporary_duty",
                               data={"responsible": '["T001"]'},
                               headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_list_duties(self, client, auth_token, app):
        with app.app_context():
            create_duty(client, auth_token)
            resp = json_post(client, "/api/temporary_duty/temporary_duty_list",
                             {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "data_list" in data["content"]

    def test_list_duties_filter_status(self, client, auth_token, app):
        with app.app_context():
            create_duty(client, auth_token)
            resp = json_post(client, "/api/temporary_duty/temporary_duty_list",
                             {"duty_status": 0}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_get_duty_detail(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            assert did is not None
            resp = json_get(client, f"/api/temporary_duty/{did}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["id"] == did

    def test_get_nonexistent_duty(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/temporary_duty/ghost-id-000", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_update_duty(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            resp = client.put(f"/api/temporary_duty/{did}",
                              data={"duty_nm": "更新任务名"},
                              headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_duty(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            resp = json_delete(client, f"/api/temporary_duty/{did}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_nonexistent_duty(self, client, auth_token, app):
        with app.app_context():
            resp = json_delete(client, "/api/temporary_duty/ghost-id-000",
                               token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestDutyLifecycle:
    """任务状态流转：草稿→激活→搁置→恢复→完结审核"""

    def test_activate_duty(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            resp = json_post(client, f"/api/temporary_duty/{did}/activate",
                             {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_hold_duty(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            json_post(client, f"/api/temporary_duty/{did}/activate", {}, token=auth_token)
            resp = json_post(client, f"/api/temporary_duty/{did}/hold", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_resume_duty(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            json_post(client, f"/api/temporary_duty/{did}/activate", {}, token=auth_token)
            json_post(client, f"/api/temporary_duty/{did}/hold", {}, token=auth_token)
            resp = json_post(client, f"/api/temporary_duty/{did}/resume", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_submit_completion(self, client, auth_token, seed_user, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            json_post(client, f"/api/temporary_duty/{did}/activate", {}, token=auth_token)
            resp = json_post(client, f"/api/temporary_duty/{did}/submit_completion",
                             {"reviewer": ["T001"], "submitter_name": "测试用户"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_reschedule_duty(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            resp = json_post(client, f"/api/temporary_duty/{did}/reschedule",
                             {"new_end_date": "2027-06-30", "reason": "资源不足"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_reschedule_requires_date(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            resp = json_post(client, f"/api/temporary_duty/{did}/reschedule",
                             {"reason": "无日期"}, token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_set_status_directly(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            resp = json_put(client, f"/api/temporary_duty/{did}/set_status",
                            {"status": 2}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestDutyProgress:
    """任务进度"""

    def test_get_progress_empty(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            resp = json_get(client, f"/api/temporary_duty/{did}/progress", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_progress(self, client, auth_token, app):
        with app.app_context():
            did = create_duty(client, auth_token)
            # Must activate duty (status=1) before creating progress
            json_post(client, f"/api/temporary_duty/{did}/activate", {}, token=auth_token)
            resp = client.post(f"/api/temporary_duty/{did}/progress",
                               data={"content": "完成了基础框架", "progress": "25"},
                               headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_unread_progress_count(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/temporary_duty/progress", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_task_list(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/temporary_duty/tasklist", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestDutyReview:
    """任务审核"""

    def test_review_list(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/temporary_duty/review_list", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_approve_nonexistent_review(self, client, auth_token, app):
        with app.app_context():
            resp = json_put(client, "/api/temporary_duty/review/ghost-review-id",
                            {"status": 2}, token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"
