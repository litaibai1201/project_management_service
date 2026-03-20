# -*- coding: utf-8 -*-
"""
@文件: test_queue_celery.py
@说明: CeleryClientManager 单元测试（使用 Mock 替代真实 Celery/Redis）
@时间: 2026-03-09

运行: python -m pytest tests/test_queue_celery.py -v
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")

# Mock celery and kombu before importing any module that depends on them
_mock_celery = MagicMock()
_mock_celery_schedules = MagicMock()
_mock_kombu = MagicMock()
for _mod in ["celery", "celery.schedules", "kombu", "kombu.common"]:
    sys.modules.setdefault(_mod, MagicMock())


class TestCeleryClientManagerInit(unittest.TestCase):
    """CeleryClientManager 初始化测试"""

    def test_app_property_raises_before_init(self):
        from queues.celery_queue.client import CeleryClientManager
        manager = CeleryClientManager()
        with self.assertRaises(RuntimeError):
            _ = manager.app

    def test_init_app_creates_celery_instance(self):
        from queues.celery_queue.client import CeleryClientManager

        with patch("queues.celery_queue.client.Celery") as MockCelery:
            mock_celery_instance = MagicMock()
            mock_celery_instance.conf = MagicMock()
            MockCelery.return_value = mock_celery_instance

            app_config = {
                "CELERY_BROKER_URL": "redis://localhost:6379/1",
                "CELERY_RESULT_BACKEND": "redis://localhost:6379/2",
                "CELERY_TIMEZONE": "Asia/Shanghai",
                "CELERY_RESULT_EXPIRES": "3600",
                "CELERY_TASK_TIME_LIMIT": "3600",
                "CELERY_TASK_SOFT_TIME_LIMIT": "3000",
                "CELERY_WORKER_PREFETCH_MULTIPLIER": "4",
                "CELERY_WORKER_MAX_TASKS_PER_CHILD": "1000",
                "CELERY_ENABLE_UTC": "true",
                "CELERY_TASK_SERIALIZER": "json",
                "CELERY_RESULT_SERIALIZER": "json",
            }
            flask_app = MagicMock()
            flask_app.import_name = "test_app"
            flask_app.config.get = lambda k, default=None: app_config.get(k, default)
            flask_app.extensions = {}

            manager = CeleryClientManager()
            manager.init_app(flask_app)
            self.assertIsNotNone(manager._celery_app)

    def test_init_app_uses_redis_host_port_fallback(self):
        from queues.celery_queue.client import CeleryClientManager

        with patch("queues.celery_queue.client.Celery") as MockCelery:
            mock_celery_instance = MagicMock()
            mock_celery_instance.conf = MagicMock()
            MockCelery.return_value = mock_celery_instance

            flask_app = MagicMock()
            flask_app.import_name = "test_app"
            flask_app.extensions = {}

            # config.get returns None for CELERY_ keys → falls back to REDIS_HOST/PORT
            def config_get(k, default=None):
                mapping = {
                    "REDIS_HOST": "myredis",
                    "REDIS_PORT": 6380,
                    "CELERY_ENABLE_UTC": "true",
                }
                return mapping.get(k, default)

            flask_app.config.get = config_get

            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("CELERY_BROKER_URL", None)
                os.environ.pop("CELERY_RESULT_BACKEND", None)

                manager = CeleryClientManager()
                manager.init_app(flask_app)

                call_kwargs = MockCelery.call_args[1]
                self.assertIn("myredis", call_kwargs["broker"])
                self.assertIn("6380", str(call_kwargs["broker"]))


class TestCeleryGetTaskInfo(unittest.TestCase):
    """get_task_info 测试"""

    def _make_manager_with_mock_celery(self):
        from queues.celery_queue.client import CeleryClientManager
        manager = CeleryClientManager()
        mock_celery = MagicMock()
        manager._celery_app = mock_celery
        return manager, mock_celery

    def test_get_task_info_pending(self):
        manager, mock_celery = self._make_manager_with_mock_celery()

        async_result = MagicMock()
        async_result.status = "PENDING"
        async_result.ready.return_value = False
        async_result.successful.return_value = False
        async_result.failed.return_value = False
        async_result.info = None
        mock_celery.AsyncResult.return_value = async_result

        info = manager.get_task_info("task-123")
        self.assertEqual(info["status"], "PENDING")
        self.assertFalse(info["ready"])
        self.assertIsNone(info["successful"])
        self.assertIsNone(info["failed"])

    def test_get_task_info_success(self):
        manager, mock_celery = self._make_manager_with_mock_celery()

        async_result = MagicMock()
        async_result.status = "SUCCESS"
        async_result.ready.return_value = True
        async_result.successful.return_value = True
        async_result.failed.return_value = False
        async_result.get.return_value = {"output": 42}
        async_result.info = None
        mock_celery.AsyncResult.return_value = async_result

        info = manager.get_task_info("task-456")
        self.assertEqual(info["status"], "SUCCESS")
        self.assertTrue(info["ready"])
        self.assertTrue(info["successful"])
        self.assertEqual(info["result"], {"output": 42})

    def test_get_task_info_failure(self):
        manager, mock_celery = self._make_manager_with_mock_celery()

        async_result = MagicMock()
        async_result.status = "FAILURE"
        async_result.ready.return_value = True
        async_result.successful.return_value = False
        async_result.failed.return_value = True
        async_result.info = Exception("task failed")
        mock_celery.AsyncResult.return_value = async_result

        info = manager.get_task_info("task-789")
        self.assertEqual(info["status"], "FAILURE")
        self.assertTrue(info["failed"])
        self.assertIn("error", info)

    def test_get_task_info_includes_info_if_present(self):
        manager, mock_celery = self._make_manager_with_mock_celery()

        async_result = MagicMock()
        async_result.status = "STARTED"
        async_result.ready.return_value = False
        async_result.successful.return_value = False
        async_result.failed.return_value = False
        async_result.info = {"progress": 50}
        mock_celery.AsyncResult.return_value = async_result

        info = manager.get_task_info("task-999")
        self.assertIn("info", info)
        self.assertEqual(info["info"]["progress"], 50)


class TestCeleryRevokeTask(unittest.TestCase):
    """revoke_task 测试"""

    def _make_manager_with_mock_celery(self):
        from queues.celery_queue.client import CeleryClientManager
        manager = CeleryClientManager()
        mock_celery = MagicMock()
        manager._celery_app = mock_celery
        return manager, mock_celery

    def test_revoke_task_success(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        result = manager.revoke_task("task-123")
        self.assertTrue(result)
        mock_celery.control.revoke.assert_called_once_with(
            "task-123", terminate=False, signal="SIGTERM"
        )

    def test_revoke_task_with_terminate(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        result = manager.revoke_task("task-456", terminate=True, signal="SIGKILL")
        self.assertTrue(result)
        mock_celery.control.revoke.assert_called_once_with(
            "task-456", terminate=True, signal="SIGKILL"
        )

    def test_revoke_task_returns_false_on_error(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.revoke.side_effect = Exception("revoke error")
        result = manager.revoke_task("task-fail")
        self.assertFalse(result)


class TestCeleryPurgeQueue(unittest.TestCase):
    """purge_queue 测试"""

    def _make_manager_with_mock_celery(self):
        from queues.celery_queue.client import CeleryClientManager
        manager = CeleryClientManager()
        mock_celery = MagicMock()
        manager._celery_app = mock_celery
        return manager, mock_celery

    def test_purge_queue_returns_count(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.purge.return_value = 5
        result = manager.purge_queue("default")
        self.assertEqual(result, 5)

    def test_purge_queue_returns_zero_on_error(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.purge.side_effect = Exception("purge error")
        result = manager.purge_queue("default")
        self.assertEqual(result, 0)


class TestCeleryGetTasks(unittest.TestCase):
    """get_active_tasks / get_scheduled_tasks / get_registered_tasks 测试"""

    def _make_manager_with_mock_celery(self):
        from queues.celery_queue.client import CeleryClientManager
        manager = CeleryClientManager()
        mock_celery = MagicMock()
        manager._celery_app = mock_celery
        return manager, mock_celery

    def test_get_active_tasks_returns_dict(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.return_value.active.return_value = {"worker1": [{"id": "t1"}]}
        result = manager.get_active_tasks()
        self.assertIsInstance(result, dict)
        self.assertIn("worker1", result)

    def test_get_active_tasks_returns_empty_on_none(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.return_value.active.return_value = None
        result = manager.get_active_tasks()
        self.assertEqual(result, {})

    def test_get_active_tasks_returns_empty_on_error(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.side_effect = Exception("inspect error")
        result = manager.get_active_tasks()
        self.assertEqual(result, {})

    def test_get_scheduled_tasks_returns_dict(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.return_value.scheduled.return_value = {"worker1": []}
        result = manager.get_scheduled_tasks()
        self.assertIsInstance(result, dict)

    def test_get_scheduled_tasks_returns_empty_on_error(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.side_effect = Exception("error")
        result = manager.get_scheduled_tasks()
        self.assertEqual(result, {})

    def test_get_registered_tasks_returns_dict(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.return_value.registered.return_value = {
            "worker1": ["tasks.add", "tasks.send_email"]
        }
        result = manager.get_registered_tasks()
        self.assertIn("worker1", result)

    def test_get_registered_tasks_returns_empty_on_none(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.return_value.registered.return_value = None
        result = manager.get_registered_tasks()
        self.assertEqual(result, {})

    def test_get_registered_tasks_returns_empty_on_error(self):
        manager, mock_celery = self._make_manager_with_mock_celery()
        mock_celery.control.inspect.side_effect = Exception("error")
        result = manager.get_registered_tasks()
        self.assertEqual(result, {})


if __name__ == "__main__":
    unittest.main()
