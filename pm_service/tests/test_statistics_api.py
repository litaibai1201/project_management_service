# -*- coding: utf-8 -*-
"""统计接口测试 — /api/statistics"""
import pytest
from tests.conftest import json_get


class TestMemberStats:
    """成员工作统计"""

    def test_member_stats_no_subordinates(self, client, auth_token, app):
        """无下属时返回空列表"""
        with app.app_context():
            resp = json_get(client, "/api/statistics/member_stats", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"]["members"], list)

    def test_member_stats_with_date(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/statistics/member_stats", token=auth_token,
                            params={"start_date": "2026-05-01", "end_date": "2026-05-31"})
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_member_stats_with_subordinates(self, client, app, db, seed_supervisor):
        """主管有下属时返回下属统计"""
        with app.app_context():
            sup_wn, sup_pwd = seed_supervisor["supervisor"]
            from tests.conftest import json_post
            login = json_post(client, "/api/user/login",
                              {"work_no": sup_wn, "password": sup_pwd})
            token = login.get_json()["content"]["access_token"]
            resp = json_get(client, "/api/statistics/member_stats", token=token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            # 主管视角应返回下属的统计
            assert isinstance(data["content"]["members"], list)

    def test_member_stats_requires_auth(self, client, app):
        with app.app_context():
            resp = json_get(client, "/api/statistics/member_stats")
            assert resp.status_code in (401, 422)


class TestPersonalStats:
    """个人详细工时分析"""

    def test_personal_stats_self(self, client, auth_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_get(client, "/api/statistics/personal_stats", token=auth_token,
                            params={"work_no": work_no})
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_personal_stats_default_self(self, client, auth_token, app):
        """不传 work_no 默认查自己"""
        with app.app_context():
            resp = json_get(client, "/api/statistics/personal_stats", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_personal_stats_with_date_range(self, client, auth_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_get(client, "/api/statistics/personal_stats", token=auth_token,
                            params={"work_no": work_no,
                                    "start_date": "2026-01-01",
                                    "end_date": "2026-05-31"})
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestProgressReport:
    """进度报告"""

    def test_progress_report_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/statistics/progress_report", token=auth_token,
                            params={"start_date": "2026-05-01", "end_date": "2026-05-31"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_progress_report_no_date(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/statistics/progress_report", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_progress_report_requires_auth(self, client, app):
        with app.app_context():
            resp = json_get(client, "/api/statistics/progress_report")
            assert resp.status_code in (401, 422)


class TestAnomalies:
    """异常管理看板"""

    def test_anomalies_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/statistics/anomalies", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)

    def test_anomalies_requires_auth(self, client, app):
        with app.app_context():
            resp = json_get(client, "/api/statistics/anomalies")
            assert resp.status_code in (401, 422)
