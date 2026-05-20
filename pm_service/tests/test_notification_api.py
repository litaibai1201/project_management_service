# -*- coding: utf-8 -*-
"""通知接口测试 — /api/notification"""
import pytest
from tests.conftest import json_post, json_get


class TestNotificationList:
    """通知列表"""

    def test_list_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_get(client, "/api/notification/list", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] == 0
            assert data["content"]["unread_count"] == 0

    def test_list_with_notification(self, client, auth_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import NotificationModel
            n = NotificationModel(recipient="t001", title="测试通知", desc="内容")
            db.session.add(n)
            db.session.commit()
            resp = json_get(client, "/api/notification/list", token=auth_token)
            data = resp.get_json()
            assert data["content"]["total_count"] == 1
            assert data["content"]["unread_count"] == 1

    def test_list_requires_auth(self, client, app):
        with app.app_context():
            resp = json_get(client, "/api/notification/list")
            assert resp.status_code in (401, 422)

    def test_list_pagination(self, client, auth_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import NotificationModel
            for i in range(5):
                db.session.add(NotificationModel(recipient="t001", title=f"通知{i}"))
            db.session.commit()
            resp = json_get(client, "/api/notification/list", token=auth_token,
                            params={"page": 1, "size": 3})
            data = resp.get_json()
            assert len(data["content"]["data_list"]) <= 3


class TestMarkRead:
    """标记已读"""

    def test_mark_single_read(self, client, auth_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import NotificationModel
            n = NotificationModel(recipient="t001", title="标记测试")
            db.session.add(n)
            db.session.commit()
            nid = n.id
            resp = client.patch(f"/api/notification/{nid}/read",
                                headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            # 验证已读状态
            db.session.refresh(n)
            assert n.is_read is True

    def test_mark_all_read(self, client, auth_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import NotificationModel
            for i in range(3):
                db.session.add(NotificationModel(recipient="t001", title=f"通知{i}"))
            db.session.commit()
            resp = client.patch("/api/notification/read_all",
                                headers={"Authorization": f"Bearer {auth_token}"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            unread = (db.session.query(NotificationModel)
                      .filter_by(recipient="t001", is_read=False).count())
            assert unread == 0

    def test_mark_other_user_notification(self, client, auth_token, app, db):
        """不能标记他人通知（应被忽略或报错）"""
        with app.app_context():
            from dbs.mysql_db.model_tables import NotificationModel
            n = NotificationModel(recipient="OTHER01", title="他人通知")
            db.session.add(n)
            db.session.commit()
            nid = n.id
            resp = client.patch(f"/api/notification/{nid}/read",
                                headers={"Authorization": f"Bearer {auth_token}"})
            # 标记他人通知不应该成功改变状态
            db.session.refresh(n)
            assert n.is_read is False


class TestDailyLogReminder:
    """日报提醒推送 POST /api/notification/remind_daily_log"""

    def test_remind_success(self, client, auth_token, seed_user, app):
        with app.app_context():
            work_no, _ = seed_user
            resp = json_post(client, "/api/notification/remind_daily_log",
                             {"work_nos": [work_no]}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            # 应有成功消息
            assert "1" in data.get("msg", "")

    def test_remind_empty_list(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/notification/remind_daily_log",
                             {"work_nos": []}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "0" in data.get("msg", "")

    def test_remind_multiple(self, client, auth_token, app, db):
        with app.app_context():
            from dbs.mysql_db.model_tables import UserProfileModel
            u2 = UserProfileModel(work_no="T002", name="用户2", password="x", status=1)
            db.session.add(u2)
            db.session.commit()
            resp = json_post(client, "/api/notification/remind_daily_log",
                             {"work_nos": ["T001", "T002"]}, token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "2" in data.get("msg", "")

    def test_remind_requires_auth(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/notification/remind_daily_log",
                             {"work_nos": ["T001"]})
            assert resp.status_code in (401, 422)
