# -*- coding: utf-8 -*-
"""全局搜索接口测试 — /api/search"""
import pytest
from tests.conftest import json_post, json_get, json_put, json_delete


# ── 辅助：在数据库中预置各类型的可搜索对象 ───────────────────────────────────

def seed_project(client, token, name="搜索测试专案"):
    resp = client.post("/api/project/create_project",
                       data={"project_nm": name, "project_type": "研发"},
                       headers={"Authorization": f"Bearer {token}"})
    data = resp.get_json()
    return data.get("content", {}).get("project_id")


def seed_duty(client, token, name="搜索测试AR"):
    resp = client.post("/api/temporary_duty/create_temporary_duty",
                       data={"duty_nm": name, "responsible": '["T001"]',
                             "expected_end_date": "2026-12-31"},
                       headers={"Authorization": f"Bearer {token}"})
    data = resp.get_json()
    return data.get("content", {}).get("duty_id") or data.get("content", {}).get("id")


class TestSearchBasic:
    """基础搜索功能"""

    def test_search_empty_db_returns_empty(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/search",
                             {"keyword": "不存在的内容XYZ"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["total_count"] == 0
            assert data["content"]["data_list"] == []

    def test_search_returns_required_fields(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/search",
                             {"keyword": "测试"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert "total_count" in data["content"]
            assert "total_page" in data["content"]
            assert "data_list" in data["content"]

    def test_search_requires_auth(self, client, app):
        with app.app_context():
            resp = json_post(client, "/api/search", {"keyword": "测试"})
            assert resp.status_code in (401, 422)


class TestSearchByType:
    """按类型过滤搜索"""

    def test_search_project_type(self, client, auth_token, app):
        with app.app_context():
            seed_project(client, auth_token, "专案关键字测试")
            resp = json_post(client, "/api/search",
                             {"keyword": "专案关键字测试", "type": "project"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            results = data["content"]["data_list"]
            if results:
                assert all(r["type"] == "project" for r in results)

    def test_search_duty_type(self, client, auth_token, app):
        with app.app_context():
            seed_duty(client, auth_token, "AR关键字测试")
            resp = json_post(client, "/api/search",
                             {"keyword": "AR关键字测试", "type": "duty"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            results = data["content"]["data_list"]
            if results:
                assert all(r["type"] == "duty" for r in results)

    def test_search_requirement_type(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/search",
                             {"keyword": "需求", "type": "requirement"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"

    def test_search_function_type(self, client, auth_token, app):
        with app.app_context():
            resp = json_post(client, "/api/search",
                             {"keyword": "任务", "type": "function"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"


class TestSearchResults:
    """搜索结果内容验证"""

    def test_search_project_result_has_required_fields(self, client, auth_token, app):
        with app.app_context():
            seed_project(client, auth_token, "字段验证专案")
            resp = json_post(client, "/api/search",
                             {"keyword": "字段验证专案", "type": "project"},
                             token=auth_token)
            data = resp.get_json()
            results = data["content"]["data_list"]
            if results:
                proj = results[0]
                assert "id" in proj
                assert "type" in proj
                assert "title" in proj
                assert proj["type"] == "project"

    def test_search_duty_result_has_required_fields(self, client, auth_token, app):
        with app.app_context():
            seed_duty(client, auth_token, "AR字段验证")
            resp = json_post(client, "/api/search",
                             {"keyword": "AR字段验证", "type": "duty"},
                             token=auth_token)
            data = resp.get_json()
            results = data["content"]["data_list"]
            if results:
                duty = results[0]
                assert "id" in duty
                assert "type" in duty
                assert "title" in duty
                assert duty["type"] == "duty"

    def test_search_all_types_no_filter(self, client, auth_token, app):
        """不指定类型时，搜索所有类型"""
        with app.app_context():
            seed_project(client, auth_token, "综合搜索专案")
            seed_duty(client, auth_token, "综合搜索AR")
            resp = json_post(client, "/api/search",
                             {"keyword": "综合搜索"},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            # 不限类型，应能找到两条以上
            assert data["content"]["total_count"] >= 2


class TestSearchPagination:
    """搜索分页"""

    def test_search_pagination_page1(self, client, auth_token, app):
        with app.app_context():
            for i in range(3):
                seed_project(client, auth_token, f"分页测试专案{i}")
            resp = json_post(client, "/api/search",
                             {"keyword": "分页测试专案", "page": 1, "size": 2},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert len(data["content"]["data_list"]) <= 2

    def test_search_pagination_total_page_calculation(self, client, auth_token, app):
        with app.app_context():
            for i in range(3):
                seed_project(client, auth_token, f"总页数专案{i}")
            resp = json_post(client, "/api/search",
                             {"keyword": "总页数专案", "page": 1, "size": 2},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            total = data["content"]["total_count"]
            size = 2
            expected_pages = (total + size - 1) // size if size else 1
            assert data["content"]["total_page"] == expected_pages

    def test_search_page_beyond_results(self, client, auth_token, app):
        """超出范围的页码返回空列表（不报错）"""
        with app.app_context():
            resp = json_post(client, "/api/search",
                             {"keyword": "不存在的内容XYZ", "page": 999, "size": 20},
                             token=auth_token)
            data = resp.get_json()
            assert data["code"] == "S10000"
            assert data["content"]["data_list"] == []
