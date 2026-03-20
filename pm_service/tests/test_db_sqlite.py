# -*- coding: utf-8 -*-
"""
@文件: test_db_sqlite.py
@说明: SQLiteDBManager / ShardingSQLiteManager / BaseDBManager 单元测试
@时间: 2026-03-09

运行: python -m pytest tests/test_db_sqlite.py -v
"""
import os
import tempfile
import unittest

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

from sqlalchemy import Column, String, Integer

from dbs.db_manager import BaseDBManager


class TestBaseDBManagerWithSQLite(unittest.TestCase):
    """用 SQLiteDBManager（实际实现了 BaseDBManager）验证基类功能"""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        from dbs.sqlite_db import SQLiteDBManager
        self.manager = SQLiteDBManager(config={
            "db_path": self.tmp_dir,
            "db_name": "test_base.db",
            "pool_size": 2,
            "max_overflow": 3,
            "pool_timeout": 5,
            "pool_pre_ping": True,
            "connect_timeout": 5,
        })

    def tearDown(self):
        self.manager.dispose()

    # ==================== 连接 URI ====================

    def test_connection_uri_sqlite_format(self):
        uri = self.manager.get_connection_uri()
        self.assertTrue(uri.startswith("sqlite:///"))
        self.assertIn("test_base.db", uri)

    def test_engine_created_lazily(self):
        """访问 engine 属性时才创建引擎"""
        engine = self.manager.engine
        self.assertIsNotNone(engine)

    def test_engine_is_reused(self):
        """多次访问 engine 返回同一实例"""
        e1 = self.manager.engine
        e2 = self.manager.engine
        self.assertIs(e1, e2)

    # ==================== 连接存活 ====================

    def test_is_connection_alive_returns_true(self):
        result = self.manager.is_connection_alive()
        self.assertTrue(result)

    # ==================== session_scope ====================

    def test_session_scope_commits(self):
        from sqlalchemy import text
        with self.manager.session_scope() as session:
            session.execute(text("SELECT 1"))

    def test_session_scope_rollback_on_error(self):
        from sqlalchemy import text
        with self.assertRaises(Exception):
            with self.manager.session_scope() as session:
                raise RuntimeError("故意抛出异常")

    # ==================== create/drop tables ====================

    def test_create_and_drop_tables(self):
        from sqlalchemy import Column, String, Integer
        # 在 Base 上定义一个简单表
        TestTable = type("TestTable", (self.manager.Base,), {
            "__tablename__": "test_sqlite_table",
            "__table_args__": {"extend_existing": True},
            "id": Column(Integer, primary_key=True),
            "name": Column(String(50)),
        })

        result = self.manager.create_all_tables()
        self.assertTrue(result)

        result_drop = self.manager.drop_all_tables()
        self.assertTrue(result_drop)

    # ==================== dispose ====================

    def test_dispose(self):
        _ = self.manager.engine  # 确保 engine 已创建
        self.manager.dispose()
        # dispose 后引擎仍然存在，但连接池已释放
        self.assertIsNotNone(self.manager._engine)


class TestSQLiteDBManager(unittest.TestCase):
    """SQLiteDBManager 独立功能测试"""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()

    def test_default_config_creates_manager(self):
        from unittest.mock import patch, PropertyMock
        with patch("configs.base.BaseConfig.SQLITE_CONFIG", new_callable=PropertyMock,
                   return_value={"db_path": self.tmp_dir, "db_name": "default.db"}):
            from dbs.sqlite_db import SQLiteDBManager
            manager = SQLiteDBManager()
            uri = manager.get_connection_uri()
            self.assertIn("default.db", uri)
            manager.dispose()

    def test_custom_config(self):
        from dbs.sqlite_db import SQLiteDBManager
        manager = SQLiteDBManager(config={
            "db_path": self.tmp_dir,
            "db_name": "custom.db",
        })
        uri = manager.get_connection_uri()
        self.assertIn("custom.db", uri)
        manager.dispose()

    def test_db_directory_created(self):
        """构造时自动创建目录"""
        new_dir = os.path.join(self.tmp_dir, "sub", "db_dir")
        from dbs.sqlite_db import SQLiteDBManager
        manager = SQLiteDBManager(config={
            "db_path": new_dir,
            "db_name": "new.db",
        })
        self.assertTrue(os.path.exists(new_dir))
        manager.dispose()

    def test_session_factory(self):
        from dbs.sqlite_db import SQLiteDBManager
        manager = SQLiteDBManager(config={
            "db_path": self.tmp_dir,
            "db_name": "session.db",
        })
        sf = manager.session_factory
        self.assertIsNotNone(sf)
        manager.dispose()

    def test_scoped_session(self):
        from dbs.sqlite_db import SQLiteDBManager
        manager = SQLiteDBManager(config={
            "db_path": self.tmp_dir,
            "db_name": "scoped.db",
        })
        ss = manager.scoped_session
        self.assertIsNotNone(ss)
        manager.dispose()


class TestShardingSQLiteManager(unittest.TestCase):
    """ShardingSQLiteManager 分片功能测试"""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        from dbs.sqlite_db import ShardingSQLiteManager
        self.manager = ShardingSQLiteManager(config={
            "db_path": self.tmp_dir,
            "db_name": "app.db",
            "pool_size": 2,
            "max_overflow": 3,
            "pool_timeout": 5,
            "pool_pre_ping": True,
            "connect_timeout": 5,
        })

    def tearDown(self):
        self.manager.clear_cache()

    # ==================== shard key ====================

    def test_get_shard_key_empty_returns_today(self):
        from datetime import datetime
        key = self.manager._get_shard_key("")
        today = datetime.now().strftime("%Y%m%d")
        self.assertEqual(key, today)

    def test_get_shard_key_from_date_string(self):
        key = self.manager._get_shard_key("2024-01-15")
        self.assertEqual(key, "20240115")

    def test_get_shard_key_from_yyyymmdd(self):
        key = self.manager._get_shard_key("20240115")
        self.assertEqual(key, "20240115")

    def test_get_shard_key_invalid_returns_today(self):
        from datetime import datetime
        key = self.manager._get_shard_key("invalid_date")
        today = datetime.now().strftime("%Y%m%d")
        self.assertEqual(key, today)

    # ==================== db name ====================

    def test_get_db_name_with_extension(self):
        name = self.manager._get_db_name("app.db", "20240115")
        self.assertEqual(name, "app_20240115.db")

    def test_get_db_name_without_extension(self):
        name = self.manager._get_db_name("app", "20240115")
        self.assertEqual(name, "app_20240115")

    # ==================== shard session ====================

    def test_get_shard_session_returns_tuple(self):
        result = self.manager.get_shard_session("app.db", "2024-01-15")
        self.assertEqual(len(result), 5)
        Base, engine, Session, db_path, shard_key = result
        self.assertEqual(shard_key, "20240115")
        self.assertIn("20240115", db_path)

    def test_get_shard_session_cached(self):
        """同日期多次调用返回相同 engine"""
        _, engine1, _, _, _ = self.manager.get_shard_session("app.db", "2024-01-15")
        _, engine2, _, _, _ = self.manager.get_shard_session("app.db", "2024-01-15")
        self.assertIs(engine1, engine2)

    def test_different_dates_create_different_engines(self):
        _, engine1, _, _, _ = self.manager.get_shard_session("app.db", "2024-01-15")
        _, engine2, _, _, _ = self.manager.get_shard_session("app.db", "2024-01-16")
        self.assertIsNot(engine1, engine2)

    def test_clear_cache(self):
        self.manager.get_shard_session("app.db", "2024-01-15")
        self.manager.clear_cache()
        self.assertEqual(len(self.manager._engine_cache), 0)
        self.assertEqual(len(self.manager._session_cache), 0)


if __name__ == "__main__":
    unittest.main()
