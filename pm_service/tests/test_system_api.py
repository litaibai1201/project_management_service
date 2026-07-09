# -*- coding: utf-8 -*-
"""系统管理接口测试 — /api/system"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


# ── 辅助：以管理员身份创建系统，返回 system_id ────────────────────────────────

def create_system(client, token, overrides=None):
    payload = {"sys_nm": "测试系统", "sys_group": "研发组"}
    if overrides:
        payload.update(overrides)
    resp = json_post(client, "/api/system/create", payload, token=token)
    data = resp.get_json()
    return data.get("content", {}).get("id")


# ── 辅助：给普通用户赋予 admin role ──────────────────────────────────────────

def grant_admin_role(app, db, work_no):
    with app.app_context():
        from dbs.mysql_db.model_tables import UserRoleModel
        role = UserRoleModel(work_no=work_no, role_code="admin")
        db.session.add(role)
        db.session.commit()


class TestSystemList:
    """列表查询"""

    def test_list_systems_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/system/list", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "data_list" in data["content"]
            assert data["content"]["total_count"] == 0

    def test_list_systems_with_data(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            create_system(client, auth_token)
            resp = json_post(client, "/api/system/list", {}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] >= 1

    def test_list_systems_keyword_filter(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            create_system(client, auth_token, {"sys_nm": "财务系统"})
            resp = json_post(client, "/api/system/list", {"keyword": "财务"}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert any("财务" in item["sys_nm"] for item in data["content"]["data_list"])

    def test_list_systems_group_filter(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            create_system(client, auth_token, {"sys_nm": "HR系统", "sys_group": "人事组"})
            resp = json_post(client, "/api/system/list", {"sys_group": "人事组"}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_list_systems_requires_auth(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/system/list", {})
            assert resp.status_code in (401, 422)


class TestSystemCreate:
    """创建系统"""

    def test_create_system_as_admin(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            resp = json_post(client, "/api/system/create",
                             {"sys_nm": "新系统", "sys_group": "研发组"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["sys_nm"] == "新系统"
            assert data["content"]["id"] is not None

    def test_create_system_without_admin_role(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/system/create",
                             {"sys_nm": "无权限系统"},
                             token=auth_token)
            data = resp.get_json()
            # 普通用户无权限，应返回错误
            assert data["code"] != "S10000"

    def test_create_system_with_maintainers(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            resp = json_post(client, "/api/system/create",
                             {"sys_nm": "含维护人系统", "maintainers": ["t001"]},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_system_requires_auth(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/system/create", {"sys_nm": "未授权"})
            assert resp.status_code in (401, 422)


class TestSystemDetail:
    """系统详情"""

    def test_get_system_detail(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            sid = create_system(client, auth_token)
            assert sid is not None
            resp = json_get(client, f"/api/system/{sid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["id"] == sid

    def test_get_nonexistent_system(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/system/ghost-id-000", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestSystemUpdate:
    """更新系统"""

    def test_update_system(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            sid = create_system(client, auth_token)
            resp = json_put(client, f"/api/system/{sid}",
                            {"sys_nm": "更新后名称"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["sys_nm"] == "更新后名称"

    def test_update_nonexistent_system(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            resp = json_put(client, "/api/system/ghost-id-000",
                            {"sys_nm": "不存在"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_update_system_without_admin(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            sid = create_system(client, auth_token)

        # 创建非管理员 token
        from tests.conftest import json_post as _post
        with app.app_context():
            from dbs.mysql_db.model_tables import UserProfileModel
            user2 = UserProfileModel(work_no="u002", name="普通用户2",
                                     department="研发部", position="工程师",
                                     password="pass1234", status=1)
            db.session.add(user2)
            db.session.commit()
        resp = _post(client, "/api/user/login", {"work_no": "u002", "password": "pass1234"})
        token2 = resp.get_json()["content"]["access_token"]
        with app.app_context():
            resp = json_put(client, f"/api/system/{sid}", {"sys_nm": "无权更新"}, token=token2)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestSystemDelete:
    """删除系统"""

    def test_delete_system(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            sid = create_system(client, auth_token)
            resp = json_delete(client, f"/api/system/{sid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_and_get_returns_not_found(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            sid = create_system(client, auth_token)
            json_delete(client, f"/api/system/{sid}", token=auth_token)
            resp = json_get(client, f"/api/system/{sid}", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_delete_nonexistent_system(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            resp = json_delete(client, "/api/system/ghost-id-000", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestSystemGroups:
    """系统分组列表"""

    def test_list_groups_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/system/groups", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_list_groups_with_data(self, client, auth_token, seed_user, app, db):
        grant_admin_role(app, db, "t001")
        with app.app_context():
            create_system(client, auth_token, {"sys_nm": "A系统", "sys_group": "A组"})
            create_system(client, auth_token, {"sys_nm": "B系统", "sys_group": "B组"})
            resp = json_get(client, "/api/system/groups", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert len(data["content"]) >= 2


class TestSystemHoursSummary:
    """系统工时汇总"""

    def test_hours_summary(self, client, auth_token, app, db):
        with app.app_context():
            grant_admin_role(app, db, "T001")
            sid = create_system(client, auth_token)
            resp = json_get(client, f"/api/system/{sid}/hours_summary", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            content = data["content"]
            assert "project_total_hours" in content
            assert isinstance(content["requirements"], list)
            assert isinstance(content["functions"], list)
            assert isinstance(content["members"], list)
