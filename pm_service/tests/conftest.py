# -*- coding: utf-8 -*-
"""
pytest 公共夹具（Fixtures）

使用内存 SQLite，不依赖真实数据库/Redis/MongoDB。
所有测试共享同一个 Flask 测试应用，每个测试前后自动清理数据库。
"""
import json
import pytest

# ── 应用工厂 ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    """创建测试专用 Flask 应用（SQLite 内存库，无 Redis/Mongo 依赖）"""
    import os
    # 防止 .env 文件覆盖测试配置
    os.environ["FLASK_ENV"] = "test"
    os.environ["REDIS_REQUIRED"] = "false"
    os.environ["MONGO_REQUIRED"] = "false"
    os.environ["DINGTALK_API_BASE"] = ""
    os.environ["DINGTALK_TOKEN"] = ""

    from app import create_app
    application = create_app("test")
    yield application


@pytest.fixture(scope="session")
def db(app):
    """初始化数据库表结构（session 级，只建一次）"""
    from dbs.mysql_db import db as _db
    with app.app_context():
        _db.create_all()
        yield _db
        _db.drop_all()


@pytest.fixture(autouse=True)
def clean_db(db, app):
    """每个测试后清空所有表，保持隔离"""
    yield
    with app.app_context():
        try:
            db.session.rollback()
            for table in reversed(db.metadata.sorted_tables):
                db.session.execute(table.delete())
            db.session.commit()
        except Exception:
            db.session.rollback()
        # 清理 MongoDB 日报集合
        try:
            from dbs.mongo_db.client import mongo_client
            if mongo_client._db is not None:
                mongo_client.db["daily_logs"].delete_many({})
        except Exception:
            pass


@pytest.fixture(scope="session")
def client(app):
    return app.test_client()


# ── 辅助函数 ──────────────────────────────────────────────────────────────────

def json_post(client, url, data, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.post(url, data=json.dumps(data), headers=headers)


def json_put(client, url, data, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.put(url, data=json.dumps(data), headers=headers)


def json_get(client, url, token=None, params=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if params:
        from urllib.parse import urlencode
        url = f"{url}?{urlencode(params)}"
    return client.get(url, headers=headers)


def json_delete(client, url, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.delete(url, headers=headers)


# ── 种子数据 fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def seed_user(app, db):
    """创建测试用户，返回 (work_no, password)"""
    with app.app_context():
        from dbs.mysql_db.model_tables import UserProfileModel
        user = UserProfileModel(
            work_no="t001",
            name="测试用户",
            department="研发部",
            position="工程师",
            password="test1234",
            status=1,
        )
        db.session.add(user)
        db.session.commit()
    return "t001", "test1234"


@pytest.fixture
def seed_supervisor(app, db):
    """创建主管用户 + 下属关系"""
    with app.app_context():
        from dbs.mysql_db.model_tables import UserProfileModel, HierarchyModel
        sup = UserProfileModel(work_no="sup01", name="主管", department="研发部",
                               position="总监", password="sup1234", status=1)
        sub = UserProfileModel(work_no="sub01", name="下属", department="研发部",
                               position="工程师", password="sub1234", status=1)
        db.session.add_all([sup, sub])
        db.session.flush()
        rel = HierarchyModel(supervisor_work_no="sup01", subordinate_work_no="sub01")
        db.session.add(rel)
        db.session.commit()
    return {"supervisor": ("sup01", "sup1234"), "subordinate": ("sub01", "sub1234")}


@pytest.fixture
def auth_token(client, seed_user, app):
    """登录后返回 JWT token"""
    with app.app_context():
        work_no, password = seed_user
        resp = json_post(client, "/api/user/login",
                         {"work_no": work_no, "password": password})
        data = resp.get_json()
        return data["content"]["access_token"]


@pytest.fixture
def admin_token(client, app, db):
    """系统管理员 JWT token"""
    with app.app_context():
        from dbs.mysql_db.model_tables import AdminUserModel
        admin = AdminUserModel(username="admin", password="admin123", name="超级管理员", status=1)
        db.session.add(admin)
        db.session.commit()
        resp = json_post(client, "/api/sys_admin/login",
                         {"username": "admin", "password": "admin123"})
        data = resp.get_json()
        return data["content"]["access_token"]
