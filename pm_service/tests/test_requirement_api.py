# -*- coding: utf-8 -*-
"""专案需求接口测试 — /api/project/<pid>/requirements"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


# ── 辅助：创建项目并设置 product_pm 为测试用户 ───────────────────────────────

def create_project_with_product_pm(client, app, db, token, work_no):
    """创建草稿阶段专案，并设置 product_pm 为当前用户（需求创建权限）"""
    resp = client.post("/api/project/create_project",
                       data={"project_nm": "需求测试专案",
                             "project_type": "研发",
                             "product_pm": work_no},
                       headers={"Authorization": f"Bearer {token}"})
    data = resp.get_json()
    pid = data.get("content", {}).get("project_id")

    # 直接在 DB 中修正 product_pm（create 接口可能忽略该字段）
    if pid:
        with app.app_context():
            from dbs.mysql_db.model_tables import ProjectDataModel
            p = db.session.query(ProjectDataModel).filter_by(id=pid).first()
            if p:
                p.product_pm = work_no.lower()
                db.session.commit()
    return pid


def create_requirement(client, token, pid, overrides=None):
    """辅助：在指定专案中创建一个草稿需求，返回 req_id"""
    payload = {"req_nm": "测试需求", "priority": 2}
    if overrides:
        payload.update(overrides)
    resp = json_post(client, f"/api/project/{pid}/requirements", payload, token=token)
    data = resp.get_json()
    return data.get("content", {}).get("id")


class TestRequirementList:
    """需求列表"""

    def test_list_requirements_empty(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            resp = json_get(client, f"/api/project/{pid}/requirements", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)
            assert len(data["content"]) == 0

    def test_list_requirements_with_data(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            create_requirement(client, auth_token, pid)
            resp = json_get(client, f"/api/project/{pid}/requirements", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert len(data["content"]) >= 1

    def test_list_requirements_requires_auth(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            resp = json_get(client, f"/api/project/{pid}/requirements")
            assert resp.status_code in (401, 422)


class TestRequirementCreate:
    """创建需求"""

    def test_create_requirement_success(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            resp = json_post(client, f"/api/project/{pid}/requirements",
                             {"req_nm": "新需求", "priority": 1},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["req_nm"] == "新需求"
            assert data["content"]["id"] is not None

    def test_create_requirement_with_responsible(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            resp = json_post(client, f"/api/project/{pid}/requirements",
                             {"req_nm": "带负责人需求", "responsible": [work_no]},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_requirement_non_product_pm_fails(self, client, auth_token, seed_user, app, db):
        """非 product_pm 用户创建需求应被拒绝"""
        with app.app_context():
            # 创建一个 product_pm 为 "other001" 的项目
            resp = client.post("/api/project/create_project",
                               data={"project_nm": "他人专案",
                                     "project_type": "研发",
                                     "product_pm": "other001"},
                               headers={"Authorization": f"Bearer {auth_token}"})
            pid = resp.get_json().get("content", {}).get("project_id")
            with app.app_context():
                from dbs.mysql_db.model_tables import ProjectDataModel
                p = db.session.query(ProjectDataModel).filter_by(id=pid).first()
                if p:
                    p.product_pm = "other001"
                    db.session.commit()

            resp = json_post(client, f"/api/project/{pid}/requirements",
                             {"req_nm": "越权需求"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_create_requirement_requires_auth(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            resp = json_post(client, f"/api/project/{pid}/requirements",
                             {"req_nm": "未授权需求"})
            assert resp.status_code in (401, 422)


class TestRequirementUpdate:
    """更新需求"""

    def test_update_requirement_success(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            rid = create_requirement(client, auth_token, pid)
            assert rid is not None
            resp = json_put(client, f"/api/project/{pid}/requirements/{rid}",
                            {"req_nm": "更新后需求名", "priority": 3},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["req_nm"] == "更新后需求名"

    def test_update_requirement_change_description(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            rid = create_requirement(client, auth_token, pid)
            resp = json_put(client, f"/api/project/{pid}/requirements/{rid}",
                            {"describe": "更新后的描述"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_update_nonexistent_requirement(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            resp = json_put(client, f"/api/project/{pid}/requirements/ghost-req-000",
                            {"req_nm": "不存在"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestRequirementDelete:
    """删除需求"""

    def test_delete_requirement_success(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            rid = create_requirement(client, auth_token, pid)
            assert rid is not None
            resp = json_delete(client, f"/api/project/{pid}/requirements/{rid}",
                               token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_nonexistent_requirement(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            resp = json_delete(client, f"/api/project/{pid}/requirements/ghost-req-000",
                               token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_deleted_requirement_not_in_list(self, client, auth_token, seed_user, app, db):
        work_no = seed_user[0]
        with app.app_context():
            pid = create_project_with_product_pm(client, app, db, auth_token, work_no)
            rid = create_requirement(client, auth_token, pid)
            json_delete(client, f"/api/project/{pid}/requirements/{rid}", token=auth_token)
            resp = json_get(client, f"/api/project/{pid}/requirements", token=auth_token)
            data = resp.get_json()
            ids = [r["id"] for r in data["content"]]
            assert rid not in ids
