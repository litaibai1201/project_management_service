# -*- coding: utf-8 -*-
"""首页 Widget 配置接口测试 — /api/dashboard/config"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


class TestDashboardConfigGet:
    """获取 Widget 配置"""

    def test_get_personal_config_default(self, client, auth_token, app):
        """首次获取配置，返回默认 personal widget 列表"""
        with app.app_context():
            resp = json_get(client, "/api/dashboard/config",
                            token=auth_token,
                            params={"view_type": "personal"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert isinstance(data["content"], list)
            assert len(data["content"]) > 0

    def test_get_personal_config_has_required_widgets(self, client, auth_token, app):
        """personal 视角必须包含 project_stats 和 task_stats 这两个不可移除 widget"""
        with app.app_context():
            resp = json_get(client, "/api/dashboard/config",
                            token=auth_token,
                            params={"view_type": "personal"})
            data = resp.get_json()
            widget_ids = [w["widget_id"] for w in data["content"]]
            assert "project_stats" in widget_ids
            assert "task_stats" in widget_ids

    def test_get_manager_config_default(self, client, auth_token, app):
        """manager 视角返回正确的 widget 列表"""
        with app.app_context():
            resp = json_get(client, "/api/dashboard/config",
                            token=auth_token,
                            params={"view_type": "manager"})
            data = resp.get_json()
            assert data["code"] == "S10000"
            widget_ids = [w["widget_id"] for w in data["content"]]
            assert "team_project" in widget_ids
            assert "team_task" in widget_ids

    def test_get_config_default_view_type_is_personal(self, client, auth_token, app):
        """不指定 view_type 时默认返回 personal"""
        with app.app_context():
            resp = json_get(client, "/api/dashboard/config", token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            widget_ids = [w["widget_id"] for w in data["content"]]
            # personal view 包含 project_stats
            assert "project_stats" in widget_ids

    def test_get_config_each_widget_has_required_fields(self, client, auth_token, app):
        """每个 widget 条目都必须有 widget_id、label、removable、is_visible 字段"""
        with app.app_context():
            resp = json_get(client, "/api/dashboard/config",
                            token=auth_token,
                            params={"view_type": "personal"})
            data = resp.get_json()
            for widget in data["content"]:
                assert "widget_id" in widget
                assert "label" in widget
                assert "removable" in widget
                assert "is_visible" in widget

    def test_get_config_requires_auth(self, client, app):
        with app.app_context():
            resp = json_get(client, "/api/dashboard/config",
                            params={"view_type": "personal"})
            assert resp.status_code in (401, 422)


class TestDashboardConfigSave:
    """保存 Widget 配置"""

    def test_save_personal_config(self, client, auth_token, app):
        """保存 personal widget 可见性配置"""
        with app.app_context():
            widgets = [
                {"widget_id": "project_stats", "is_visible": True},
                {"widget_id": "task_stats", "is_visible": True},
                {"widget_id": "pending_review", "is_visible": False},
            ]
            resp = json_put(client, "/api/dashboard/config",
                            {"view_type": "personal", "widgets": widgets},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_save_config_persists(self, client, auth_token, app):
        """保存后重新获取，配置应已更新"""
        with app.app_context():
            widgets = [
                {"widget_id": "pending_review", "is_visible": False},
            ]
            json_put(client, "/api/dashboard/config",
                     {"view_type": "personal", "widgets": widgets},
                     token=auth_token)
            resp = json_get(client, "/api/dashboard/config",
                            token=auth_token,
                            params={"view_type": "personal"})
            data = resp.get_json()
            pending = next(
                (w for w in data["content"] if w["widget_id"] == "pending_review"),
                None
            )
            assert pending is not None
            assert pending["is_visible"] is False

    def test_save_manager_config(self, client, auth_token, app):
        """保存 manager 视角 widget 配置"""
        with app.app_context():
            widgets = [
                {"widget_id": "team_project", "is_visible": True},
                {"widget_id": "daily_report_status", "is_visible": False},
            ]
            resp = json_put(client, "/api/dashboard/config",
                            {"view_type": "manager", "widgets": widgets},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_save_config_with_layout(self, client, auth_token, app):
        """保存包含 layout 信息的配置"""
        with app.app_context():
            widgets = [
                {
                    "widget_id": "project_stats",
                    "is_visible": True,
                    "layout": {"x": 0, "y": 0, "w": 4, "h": 2},
                }
            ]
            resp = json_put(client, "/api/dashboard/config",
                            {"view_type": "personal", "widgets": widgets},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_save_empty_widgets_list(self, client, auth_token, app):
        """空 widgets 列表不应报错"""
        with app.app_context():
            resp = json_put(client, "/api/dashboard/config",
                            {"view_type": "personal", "widgets": []},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_save_config_requires_auth(self, client, app):
        with app.app_context():
            resp = json_put(client, "/api/dashboard/config",
                            {"view_type": "personal", "widgets": []})
            assert resp.status_code in (401, 422)

    def test_save_upsert_existing_widget(self, client, auth_token, app):
        """重复保存同一 widget 应执行 upsert（不报错、值更新）"""
        with app.app_context():
            widgets = [{"widget_id": "pending_review", "is_visible": True}]
            json_put(client, "/api/dashboard/config",
                     {"view_type": "personal", "widgets": widgets},
                     token=auth_token)
            # 更新为不可见
            widgets[0]["is_visible"] = False
            resp = json_put(client, "/api/dashboard/config",
                            {"view_type": "personal", "widgets": widgets},
                            token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            # 验证已更新
            resp2 = json_get(client, "/api/dashboard/config",
                             token=auth_token,
                             params={"view_type": "personal"})
            data2 = resp2.get_json()
            pending = next(
                (w for w in data2["content"] if w["widget_id"] == "pending_review"),
                None
            )
            assert pending is not None
            assert pending["is_visible"] is False
