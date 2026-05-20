# -*- coding: utf-8 -*-
"""用户管理接口测试 — /api/user"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


class TestLogin:
    """POST /api/user/login"""

    def test_login_success(self, client, seed_user, app):
        with app.app_context():
            work_no, pwd = seed_user
            resp = json_post(client, "/api/user/login", {"work_no": work_no, "password": pwd})
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "access_token" in data["content"]
            assert data["content"]["work_no"] == work_no

    def test_login_wrong_password(self, client, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_post(client, "/api/user/login", {"work_no": work_no, "password": "wrong"})
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_login_nonexistent_user(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/user/login", {"work_no": "NONE99", "password": "x"})
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_login_missing_fields(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/user/login", {"work_no": "T001"})
            assert resp.status_code in (400, 422)

    def test_login_disabled_user(self, client, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import UserProfileModel
            user = UserProfileModel(work_no="DIS01", name="禁用用户",
                                    password="dis1234", status=0)
            db.session.add(user)
            db.session.commit()
            resp = json_post(client, "/api/user/login", {"work_no": "DIS01", "password": "dis1234"})
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestUserIndex:
    """GET /api/user/index — 需要 JWT"""

    def test_index_requires_auth(self, client, app):
        with app.app_context():
            resp = json_get(client, "/api/user/index")
            assert resp.status_code in (401, 422)

    def test_index_with_token(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/index", token=auth_token)
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestUserStatistical:
    """GET /api/user/statistical"""

    def test_statistical(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/statistical", token=auth_token)
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_team_statistical(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/team_statistical", token=auth_token)
            assert resp.status_code == 200


class TestUserMgmt:
    """用户 CRUD — /api/user/mgmt/users"""

    def test_list_users(self, client, auth_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/users", token=auth_token)
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] >= 1

    def test_list_users_keyword_filter(self, client, auth_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/users", token=auth_token,
                            params={"keyword": "测试"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert any("测试" in u["name"] for u in data["content"]["data_list"])

    def test_list_users_no_match(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/users", token=auth_token,
                            params={"keyword": "不存在的用户xyz"})
            data = resp.get_json()
            assert data["content"]["total_count"] == 0

    def test_create_user(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/user/mgmt/user", {
                "work_no": "NEW01", "name": "新用户", "password": "newpwd123",
                "department": "测试部", "position": "测试员"
            }, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["work_no"] == "new01"

    def test_create_duplicate_user(self, client, auth_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_post(client, "/api/user/mgmt/user", {
                "work_no": work_no, "name": "重复", "password": "123456"
            }, token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_get_user_detail(self, client, auth_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_get(client, f"/api/user/mgmt/user/{work_no}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["work_no"] == work_no

    def test_get_nonexistent_user(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/user/GHOST99", token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"

    def test_update_user(self, client, auth_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_put(client, f"/api/user/mgmt/user/{work_no}",
                            {"name": "更新后姓名", "department": "产品部"},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_user(self, client, auth_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import UserProfileModel
            u = UserProfileModel(work_no="DEL01", name="待删除", password="del1234", status=1)
            db.session.add(u)
            db.session.commit()
            resp = json_delete(client, "/api/user/mgmt/user/DEL01", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestDepartments:
    """部门管理 /api/user/mgmt/departments"""

    def test_get_departments(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/departments", token=auth_token)
            assert resp.status_code == 200

    def test_create_department(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/user/mgmt/departments",
                             {"name": "新部门"}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_create_department_empty_name(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/user/mgmt/departments",
                             {"name": ""}, token=auth_token)
            data = resp.get_json()
            assert data["code"] != "S10000"


class TestHierarchy:
    """上下级关系 /api/user/mgmt/hierarchy"""

    def test_set_relation(self, client, auth_token, seed_supervisor, app):
        with app.app_context():
            resp = json_post(client, "/api/user/mgmt/hierarchy", {
                "supervisor_work_no": "sup01",
                "subordinate_work_no": "sub01",
            }, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_get_all_relations(self, client, auth_token, seed_supervisor, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/hierarchy", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_get_subordinates(self, client, auth_token, seed_supervisor, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/sup01/subordinates", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert any(s["work_no"] == "sub01" for s in data["content"])

    def test_get_supervisors(self, client, auth_token, seed_supervisor, app):
        with app.app_context():
            resp = json_get(client, "/api/user/mgmt/sub01/supervisors", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_delete_relation(self, client, auth_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import HierarchyModel, UserProfileModel
            u1 = UserProfileModel(work_no="S001", name="上级2", password="x", status=1)
            u2 = UserProfileModel(work_no="S002", name="下级2", password="x", status=1)
            db.session.add_all([u1, u2])
            db.session.flush()
            rel = HierarchyModel(supervisor_work_no="S001", subordinate_work_no="S002")
            db.session.add(rel)
            db.session.commit()
            rel_id = rel.id
            resp = json_delete(client, f"/api/user/mgmt/hierarchy/{rel_id}", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestMyProjects:
    """个人项目/任务列表"""

    def test_my_projects(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/project", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_my_duties(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/temporary_duty", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_weekly_activity(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/weekly_activity", token=auth_token)
            assert resp.status_code == 200

    def test_alert_tasks(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/alert_tasks", token=auth_token)
            assert resp.status_code == 200

    def test_latest_news(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/user/latest_news", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
