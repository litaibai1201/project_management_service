# -*- coding: utf-8 -*-
"""系统管理员接口测试 — /api/sys_admin"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


class TestAdminLogin:
    """管理员登录（不需要 JWT）"""

    def test_login_success(self, client, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import AdminUserModel
            admin = AdminUserModel(username="sa", password="sa123", name="超管", status=1)
            db.session.add(admin)
            db.session.commit()
            resp = json_post(client, "/api/sys_admin/login",
                             {"username": "sa", "password": "sa123"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "access_token" in data["content"]
            assert data["content"]["is_admin"] is True

    def test_login_wrong_password(self, client, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import AdminUserModel
            db.session.add(AdminUserModel(username="sa2", password="real", name="管", status=1))
            db.session.commit()
            resp = json_post(client, "/api/sys_admin/login",
                             {"username": "sa2", "password": "wrong"})
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_login_nonexistent(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/sys_admin/login",
                             {"username": "nobody", "password": "x"})
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestAdminDashboard:
    def test_dashboard(self, client, admin_token, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/dashboard", token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "total_users" in data["content"]

    def test_dashboard_requires_admin(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/dashboard", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestAdminUserMgmt:
    """用户管理"""

    def test_list_users(self, client, admin_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/users", token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] >= 1

    def test_list_users_with_role(self, client, admin_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/users", token=admin_token)
            data = resp.get_json()
            user = data["content"]["data_list"][0]
            assert "role_code" in user
            assert "is_supervisor" in user

    def test_list_users_keyword(self, client, admin_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/users", token=admin_token,
                            params={"keyword": "测试"})
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_toggle_user_status(self, client, admin_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_put(client, f"/api/sys_admin/users/{work_no}/status",
                            {"status": 0}, token=admin_token)
            assert resp.get_json()["code"] == "S10000"
            # 再启用
            resp2 = json_put(client, f"/api/sys_admin/users/{work_no}/status",
                             {"status": 1}, token=admin_token)
            assert resp2.get_json()["code"] == "S10000"

    def test_reset_password(self, client, admin_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_put(client, f"/api/sys_admin/users/{work_no}/reset_password",
                            {"new_password": "newpwd999"}, token=admin_token)
            assert resp.get_json()["code"] == "S10000"

    def test_reset_password_empty(self, client, admin_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_put(client, f"/api/sys_admin/users/{work_no}/reset_password",
                            {"new_password": ""}, token=admin_token)
            assert resp.get_json()["code"] != "S10000"


class TestAdminRoleMgmt:
    """角色管理"""

    def test_list_roles(self, client, admin_token, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/roles", token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_set_user_role(self, client, admin_token, seed_user, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import RoleModel
            role = RoleModel(code="supervisor", name="主管", describe="主管角色")
            db.session.add(role)
            db.session.commit()
            work_no, _ = seed_user
            resp = json_put(client, f"/api/sys_admin/users/{work_no}/role",
                            {"role_code": "supervisor"}, token=admin_token)
            assert resp.get_json()["code"] == "S10000"

    def test_get_user_role_detail(self, client, admin_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_get(client, f"/api/sys_admin/users/{work_no}/role",
                            token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["work_no"] == work_no
            assert "subordinates" in data["content"]

    def test_clear_user_role(self, client, admin_token, seed_user, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import RoleModel, UserRoleModel
            role = RoleModel(code="dev", name="开发", describe="")
            db.session.add(role)
            db.session.flush()
            work_no, _ = seed_user
            db.session.add(UserRoleModel(work_no=work_no, role_code="dev"))
            db.session.commit()
            resp = json_put(client, f"/api/sys_admin/users/{work_no}/role",
                            {"role_code": None}, token=admin_token)
            assert resp.get_json()["code"] == "S10000"
            ur = db.session.query(UserRoleModel).filter_by(work_no=work_no).first()
            assert ur is None

    def test_set_subordinates(self, client, admin_token, seed_supervisor, app):
        with app.app_context():
            resp = json_put(client, "/api/sys_admin/users/sup01/subordinates",
                            {"subordinates": ["sub01"]}, token=admin_token)
            assert resp.get_json()["code"] == "S10000"

    def test_set_subordinates_empty(self, client, admin_token, seed_supervisor, app):
        with app.app_context():
            resp = json_put(client, "/api/sys_admin/users/sup01/subordinates",
                            {"subordinates": []}, token=admin_token)
            assert resp.get_json()["code"] == "S10000"


class TestAdminAccounts:
    """管理员账号管理"""

    def test_create_admin(self, client, admin_token, app):
        with app.app_context():
            resp = json_post(client, "/api/sys_admin/admins",
                             {"username": "new_admin", "password": "pwd123",
                              "name": "新管理员"}, token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["username"] == "new_admin"

    def test_create_admin_missing_fields(self, client, admin_token, app):
        with app.app_context():
            resp = json_post(client, "/api/sys_admin/admins",
                             {"username": "x"}, token=admin_token)
            assert resp.get_json()["code"] != "S10000"

    def test_list_admins(self, client, admin_token, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/admins", token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] >= 1

    def test_delete_admin(self, client, admin_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import AdminUserModel
            a = AdminUserModel(username="del_admin", password="x", name="待删", status=1)
            db.session.add(a)
            db.session.commit()
            aid = a.id
            resp = json_delete(client, f"/api/sys_admin/admins/{aid}", token=admin_token)
            assert resp.get_json()["code"] == "S10000"


class TestSystemConfig:
    """系统配置"""

    def test_get_configs(self, client, admin_token, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/system_config", token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_update_configs(self, client, admin_token, app):
        with app.app_context():
            # 先触发默认配置初始化
            json_get(client, "/api/sys_admin/system_config", token=admin_token)
            resp = json_put(client, "/api/sys_admin/system_config",
                            {"site_name": "新系统名称"}, token=admin_token)
            assert resp.get_json()["code"] == "S10000"


class TestOperationLogs:
    """操作日志"""

    def test_list_logs(self, client, admin_token, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/operation_logs", token=admin_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "data_list" in data["content"]

    def test_list_logs_filter(self, client, admin_token, app):
        with app.app_context():
            resp = json_get(client, "/api/sys_admin/operation_logs", token=admin_token,
                            params={"work_no": "T001", "start_date": "2026-01-01"})
            data = resp.get_json()
            assert data["code"] == "S10000"
