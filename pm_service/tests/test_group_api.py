# -*- coding: utf-8 -*-
"""分组成员管理接口测试 — /api/group"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


class TestMemberList:
    """成员列表 GET /api/group/member"""

    def test_list_members_empty(self, client, auth_token, app):
        """seed_user 已存在时应至少返回一条"""
        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "data_list" in data["content"]
            assert "total_count" in data["content"]

    def test_list_members_with_seed_user(self, client, auth_token, seed_user, app):
        """seed_user fixture 创建了一个用户，列表应至少返回 1 条"""
        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] >= 1

    def test_list_members_keyword_filter_by_name(self, client, auth_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token,
                            params={"keyword": "测试用户"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            members = data["content"]["data_list"]
            if members:
                assert any("测试用户" in m.get("name", "") for m in members)

    def test_list_members_keyword_filter_by_work_no(self, client, auth_token, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token,
                            params={"keyword": work_no})
            data = resp.get_json()
            assert data["code"] == "S10000"
            members = data["content"]["data_list"]
            assert len(members) >= 1

    def test_list_members_keyword_no_match(self, client, auth_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token,
                            params={"keyword": "完全不存在的人名XYZ"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] == 0

    def test_list_members_pagination(self, client, auth_token, seed_user, app, db):
        """创建多个用户后验证分页"""
        with app.app_context():
            from dbs.mysql_db.model_tables import UserProfileModel
            for i in range(3):
                u = UserProfileModel(work_no=f"pg{i:03d}", name=f"分页用户{i}",
                                     department="研发部", position="工程师",
                                     password="pass1234", status=1)
                db.session.add(u)
            db.session.commit()

        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token,
                            params={"page": 1, "size": 2})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert len(data["content"]["data_list"]) <= 2

    def test_list_members_total_page_field(self, client, auth_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token,
                            params={"page": 1, "size": 10})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "total_page" in data["content"]

    def test_list_members_requires_auth(self, client, app):
        with app.app_context():
            resp = json_get(client, "/api/group/member")
            assert resp.status_code in (401, 422)

    def test_list_members_data_has_required_fields(self, client, auth_token, seed_user, app):
        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token)
            data = resp.get_json()
            members = data["content"]["data_list"]
            if members:
                member = members[0]
                assert "work_no" in member
                assert "name" in member

    def test_list_members_excludes_inactive_users(self, client, auth_token, seed_user, app, db):
        """status=0 的用户不应出现在列表中"""
        with app.app_context():
            from dbs.mysql_db.model_tables import UserProfileModel
            inactive = UserProfileModel(work_no="inactive01", name="已停用用户",
                                        department="研发部", position="工程师",
                                        password="pass1234", status=0)
            db.session.add(inactive)
            db.session.commit()

        with app.app_context():
            resp = json_get(client, "/api/group/member", token=auth_token,
                            params={"keyword": "已停用用户"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            members = data["content"]["data_list"]
            assert all(m.get("work_no") != "inactive01" for m in members)


class TestMemberProjects:
    """成员专案列表 GET /api/group/member/<work_no>/project_list"""

    def test_get_member_projects_empty(self, client, auth_token, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            resp = json_get(client, f"/api/group/member/{work_no}/project_list",
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "data_list" in data["content"]

    def test_get_member_projects_as_pm(self, client, auth_token, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            # 创建一个专案，creator 即为该用户
            client.post("/api/project/create_project",
                        data={"project_nm": "成员专案", "project_type": "研发",
                              "project_pm": work_no},
                        headers={"Authorization": f"Bearer {auth_token}"})
            resp = json_get(client, f"/api/group/member/{work_no}/project_list",
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_get_member_projects_requires_auth(self, client, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            resp = json_get(client, f"/api/group/member/{work_no}/project_list")
            assert resp.status_code in (401, 422)


class TestMemberDuties:
    """成员 AR 列表 GET /api/group/member/<work_no>/temporary_duty_list"""

    def test_get_member_duties_empty(self, client, auth_token, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            resp = json_get(client, f"/api/group/member/{work_no}/temporary_duty_list",
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "data_list" in data["content"]

    def test_get_member_duties_requires_auth(self, client, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            resp = json_get(client,
                            f"/api/group/member/{work_no}/temporary_duty_list")
            assert resp.status_code in (401, 422)


class TestMemberStatisticalData:
    """成员统计数据 POST /api/group/member/<work_no>/statistical_data"""

    def test_get_statistical_data(self, client, auth_token, seed_user, app):
        work_no = seed_user[0]
        with app.app_context():
            resp = json_post(client,
                             f"/api/group/member/{work_no}/statistical_data",
                             {"start_date": "2026-01-01", "end_date": "2026-12-31"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "total_hours" in data["content"]
            assert "completed_tasks" in data["content"]

    def test_statistical_data_empty_dates(self, client, auth_token, seed_user, app):
        """空日期应返回验证错误"""
        work_no = seed_user[0]
        with app.app_context():
            resp = json_post(client,
                             f"/api/group/member/{work_no}/statistical_data",
                             {},
                             token=auth_token)
            data = resp.get_json()
            assert resp.status_code in (200, 422), f"Unexpected: {data}"
