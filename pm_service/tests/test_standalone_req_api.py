# -*- coding: utf-8 -*-
"""独立需求接口测试 — /api/standalone_req"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


# ── 辅助：创建一条独立需求，返回 req_id ───────────────────────────────────────

def create_standalone_req(client, token, overrides=None):
    payload = {"req_nm": "测试独立需求", "priority": 2}
    if overrides:
        payload.update(overrides)
    resp = json_post(client, "/api/standalone_req/create", payload, token=token)
    data = resp.get_json()
    return data.get("content", {}).get("id")


class TestStandaloneReqList:
    """独立需求列表"""

    def test_list_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/standalone_req/list", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "data_list" in data["content"]
            assert data["content"]["total_count"] == 0

    def test_list_with_data(self, client, auth_token, app):
        with app.app_context():
            create_standalone_req(client, auth_token)
            resp = json_post(client, "/api/standalone_req/list", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] >= 1

    def test_list_keyword_filter(self, client, auth_token, app):
        with app.app_context():
            create_standalone_req(client, auth_token, {"req_nm": "财务模块需求"})
            resp = json_post(client, "/api/standalone_req/list",
                             {"keyword": "财务"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            items = data["content"]["data_list"]
            assert any("财务" in item["req_nm"] for item in items)

    def test_list_status_filter(self, client, auth_token, app):
        with app.app_context():
            create_standalone_req(client, auth_token)
            resp = json_post(client, "/api/standalone_req/list",
                             {"status": 0},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_list_priority_filter(self, client, auth_token, app):
        with app.app_context():
            create_standalone_req(client, auth_token, {"priority": 1})
            resp = json_post(client, "/api/standalone_req/list",
                             {"priority": 1},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_list_pagination(self, client, auth_token, app):
        with app.app_context():
            for i in range(3):
                create_standalone_req(client, auth_token, {"req_nm": f"需求{i}"})
            resp = json_post(client, "/api/standalone_req/list",
                             {"page": 1, "size": 2},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert len(data["content"]["data_list"]) <= 2

    def test_list_requires_auth(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/standalone_req/list", {})
            assert resp.status_code in (401, 422)


class TestStandaloneReqCreate:
    """创建独立需求"""

    def test_create_basic(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/standalone_req/create",
                             {"req_nm": "基础需求"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["req_nm"] == "基础需求"
            assert data["content"]["id"] is not None

    def test_create_with_all_fields(self, client, auth_token, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            resp = json_post(client, "/api/standalone_req/create",
                             {
                                 "req_nm": "完整需求",
                                 "describe": "需求描述",
                                 "priority": 1,
                                 "responsible": [work_no],
                                 "expected_end_date": "2026-12-31",
                                 "expected_benefit": "提升效率",
                             },
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["priority"] == 1

    def test_create_with_system(self, client, auth_token, seed_user, app, db):
        """关联系统 ID 创建需求"""
        from tests.conftest import json_post as _post

        # 先给用户 admin 权限并创建一个系统
        with app.app_context():
            from dbs.mysql_db.model_tables import UserRoleModel
            role = UserRoleModel(work_no="t001", role_code="admin")
            db.session.add(role)
            db.session.commit()

        with app.app_context():
            sys_resp = _post(client, "/api/system/create",
                             {"sys_nm": "关联系统"},
                             token=auth_token)
            sid = sys_resp.get_json().get("content", {}).get("id")

        with app.app_context():
            resp = json_post(client, "/api/standalone_req/create",
                             {"req_nm": "关联系统需求", "system_id": sid},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_requires_auth(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/standalone_req/create",
                             {"req_nm": "未授权创建"})
            assert resp.status_code in (401, 422)


class TestStandaloneReqUpdate:
    """更新独立需求"""

    def test_update_req_nm(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token)
            assert rid is not None
            resp = json_put(client, f"/api/standalone_req/{rid}",
                            {"req_nm": "更新后需求名"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["req_nm"] == "更新后需求名"

    def test_update_priority(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token)
            resp = json_put(client, f"/api/standalone_req/{rid}",
                            {"priority": 3},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["priority"] == 3

    def test_update_priority(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token)
            resp = json_put(client, f"/api/standalone_req/{rid}",
                            {"priority": 3},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["priority"] == 3

    def test_update_expected_end_date(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token)
            resp = json_put(client, f"/api/standalone_req/{rid}",
                            {"expected_end_date": "2027-06-30"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_update_nonexistent_req(self, client, auth_token, app):
        with app.app_context():
            resp = json_put(client, "/api/standalone_req/ghost-id-000",
                            {"req_nm": "不存在"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_update_requires_auth(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token)
            resp = json_put(client, f"/api/standalone_req/{rid}",
                            {"req_nm": "未授权更新"})
            assert resp.status_code in (401, 422)


class TestStandaloneReqDetail:
    """独立需求详情 & 删除"""

    def test_get_detail(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token, {"req_nm": "详情需求"})
            resp = json_get(client, f"/api/standalone_req/{rid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["id"] == rid
            assert data["content"]["req_nm"] == "详情需求"

    def test_get_nonexistent(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/standalone_req/ghost-id-000", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_delete_req(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token)
            resp = json_delete(client, f"/api/standalone_req/{rid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_then_get_fails(self, client, auth_token, app):
        with app.app_context():
            rid = create_standalone_req(client, auth_token)
            json_delete(client, f"/api/standalone_req/{rid}", token=auth_token)
            resp = json_get(client, f"/api/standalone_req/{rid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"
