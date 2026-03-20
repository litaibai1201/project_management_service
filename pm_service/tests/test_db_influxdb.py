# -*- coding: utf-8 -*-
"""
@文件: test_db_influxdb.py
@说明: InfluxDBOperations 单元测试（使用 Mock 替代真实 InfluxDB 连接）
@时间: 2026-03-09

运行: python -m pytest tests/test_db_influxdb.py -v
"""
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, call

os.environ.setdefault("FLASK_ENV", "dev")
os.environ.setdefault("REDIS_REQUIRED", "false")


class TestInfluxDBOperationsInit(unittest.TestCase):
    """InfluxDBOperations 初始化测试"""

    def test_init_raises_if_not_installed(self):
        with patch("dbs.influxdb_db.operations.INFLUXDB_AVAILABLE", False):
            from dbs.influxdb_db.operations import InfluxDBOperations
            with self.assertRaises(ImportError):
                InfluxDBOperations("my_bucket")

    def test_init_uses_default_from_client(self):
        mock_client = MagicMock()
        mock_client.bucket = "default_bucket"
        mock_client.org = "default_org"

        with patch("dbs.influxdb_db.operations.INFLUXDB_AVAILABLE", True), \
             patch("dbs.influxdb_db.operations.influx_client", mock_client):
            from dbs.influxdb_db.operations import InfluxDBOperations
            ops = InfluxDBOperations()
            self.assertEqual(ops.bucket, "default_bucket")
            self.assertEqual(ops.org, "default_org")

    def test_init_with_custom_bucket_and_org(self):
        mock_client = MagicMock()
        mock_client.bucket = "default_bucket"
        mock_client.org = "default_org"

        with patch("dbs.influxdb_db.operations.INFLUXDB_AVAILABLE", True), \
             patch("dbs.influxdb_db.operations.influx_client", mock_client):
            from dbs.influxdb_db.operations import InfluxDBOperations
            ops = InfluxDBOperations(bucket="custom_bucket", org="custom_org")
            self.assertEqual(ops.bucket, "custom_bucket")
            self.assertEqual(ops.org, "custom_org")


class _InfluxTestBase(unittest.TestCase):
    """InfluxDBOperations 测试基类"""

    def setUp(self):
        self.mock_client = MagicMock()
        self.mock_client.bucket = "test_bucket"
        self.mock_client.org = "test_org"

        self.mock_write_api = MagicMock()
        self.mock_query_api = MagicMock()
        self.mock_delete_api = MagicMock()

        self.mock_client.get_write_api.return_value = self.mock_write_api
        self.mock_client.get_query_api.return_value = self.mock_query_api
        self.mock_client.get_delete_api.return_value = self.mock_delete_api

        self._client_patcher = patch("dbs.influxdb_db.operations.influx_client", self.mock_client)
        self._avail_patcher = patch("dbs.influxdb_db.operations.INFLUXDB_AVAILABLE", True)
        self._client_patcher.start()
        self._avail_patcher.start()

        # Mock Point class to avoid needing real influxdb_client
        self.mock_point_cls = MagicMock()
        self.mock_point_instance = MagicMock()
        self.mock_point_cls.return_value = self.mock_point_instance
        self.mock_point_instance.tag.return_value = self.mock_point_instance
        self.mock_point_instance.field.return_value = self.mock_point_instance
        self.mock_point_instance.time.return_value = self.mock_point_instance

        self._point_patcher = patch("dbs.influxdb_db.operations.Point", self.mock_point_cls)
        self._point_patcher.start()

        from dbs.influxdb_db.operations import InfluxDBOperations
        self.ops = InfluxDBOperations(bucket="test_bucket", org="test_org")

    def tearDown(self):
        self._client_patcher.stop()
        self._avail_patcher.stop()
        self._point_patcher.stop()


class TestInfluxDBWritePoint(_InfluxTestBase):
    """write_point 写入测试"""

    def test_write_point_success(self):
        result = self.ops.write_point(
            measurement="temperature",
            fields={"value": 23.5},
            tags={"location": "room1"}
        )
        self.assertTrue(result)
        self.mock_write_api.write.assert_called_once()

    def test_write_point_with_timestamp(self):
        ts = datetime(2024, 1, 15, 12, 0, 0)
        result = self.ops.write_point(
            measurement="temperature",
            fields={"value": 23.5},
            timestamp=ts
        )
        self.assertTrue(result)
        self.mock_point_instance.time.assert_called_once()

    def test_write_point_sets_tags(self):
        self.ops.write_point(
            measurement="temp",
            fields={"v": 1.0},
            tags={"loc": "room1", "sensor": "s1"}
        )
        # Each tag calls .tag()
        self.assertEqual(self.mock_point_instance.tag.call_count, 2)

    def test_write_point_sets_fields(self):
        self.ops.write_point(
            measurement="temp",
            fields={"v1": 1.0, "v2": 2.0}
        )
        # Each field calls .field()
        self.assertEqual(self.mock_point_instance.field.call_count, 2)

    def test_write_point_returns_false_on_error(self):
        self.mock_write_api.write.side_effect = Exception("write error")
        result = self.ops.write_point(
            measurement="temperature",
            fields={"value": 23.5}
        )
        self.assertFalse(result)

    def test_write_points_batch_success(self):
        points = [
            {"measurement": "temp", "fields": {"v": 1.0}, "tags": {"loc": "r1"}},
            {"measurement": "temp", "fields": {"v": 2.0}, "tags": {"loc": "r2"}},
        ]
        result = self.ops.write_points(points)
        self.assertTrue(result)
        self.mock_write_api.write.assert_called_once()

    def test_write_points_skips_missing_measurement(self):
        points = [
            {"fields": {"v": 1.0}},  # 缺少 measurement
            {"measurement": "temp", "fields": {"v": 2.0}},
        ]
        result = self.ops.write_points(points)
        self.assertTrue(result)
        # Only 1 point object created (skipped the one without measurement)
        self.assertEqual(self.mock_point_cls.call_count, 1)

    def test_write_points_returns_false_on_error(self):
        self.mock_write_api.write.side_effect = Exception("batch write error")
        result = self.ops.write_points([
            {"measurement": "temp", "fields": {"v": 1.0}}
        ])
        self.assertFalse(result)

    def test_write_dict_separates_tags_and_fields(self):
        data = {
            "location": "room1",
            "sensor": "s1",
            "value": 23.5,
            "humidity": 60,
        }
        result = self.ops.write_dict(
            measurement="env",
            data=data,
            tag_keys=["location", "sensor"]
        )
        self.assertTrue(result)

    def test_write_dict_with_timestamp_key(self):
        ts = datetime.now()
        data = {"time": ts, "value": 42.0}
        result = self.ops.write_dict(
            measurement="sensor",
            data=data,
            timestamp_key="time"
        )
        self.assertTrue(result)
        self.mock_point_instance.time.assert_called_once()


class TestInfluxDBQuery(_InfluxTestBase):
    """query 查询测试"""

    def _mock_record(self, measurement, field, value, time=None):
        rec = MagicMock()
        rec.get_measurement.return_value = measurement
        rec.get_field.return_value = field
        rec.get_value.return_value = value
        rec.get_time.return_value = time or datetime.now()
        rec.values = {}
        return rec

    def test_query_returns_list(self):
        record = self._mock_record("temperature", "value", 23.5)
        table = MagicMock()
        table.records = [record]
        self.mock_query_api.query.return_value = [table]

        result = self.ops.query("from(bucket: 'test') |> range(start: -1h)")
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["measurement"], "temperature")
        self.assertEqual(result[0]["field"], "value")
        self.assertEqual(result[0]["value"], 23.5)

    def test_query_returns_empty_on_error(self):
        self.mock_query_api.query.side_effect = Exception("query error")
        result = self.ops.query("from(bucket: 'test')")
        self.assertEqual(result, [])

    def test_query_range_builds_flux(self):
        self.mock_query_api.query.return_value = []
        self.ops.query_range(
            measurement="temperature",
            field="value",
            start="-1h",
            filters={"location": "room1"}
        )
        self.mock_query_api.query.assert_called_once()
        flux = self.mock_query_api.query.call_args[0][0]
        self.assertIn("temperature", flux)
        self.assertIn("value", flux)
        self.assertIn("room1", flux)

    def test_query_range_with_datetime_start(self):
        self.mock_query_api.query.return_value = []
        start_dt = datetime(2024, 1, 1, 0, 0, 0)
        self.ops.query_range("temp", "val", start=start_dt)
        self.mock_query_api.query.assert_called_once()
        flux = self.mock_query_api.query.call_args[0][0]
        self.assertIn("2024-01-01", flux)

    def test_query_range_with_timedelta_start(self):
        self.mock_query_api.query.return_value = []
        self.ops.query_range("temp", "val", start=timedelta(hours=2))
        flux = self.mock_query_api.query.call_args[0][0]
        self.assertIn("7200s", flux)

    def test_query_last_returns_first_result(self):
        record = self._mock_record("temperature", "value", 23.5)
        table = MagicMock()
        table.records = [record]
        self.mock_query_api.query.return_value = [table]

        result = self.ops.query_last("temperature", "value")
        self.assertIsNotNone(result)
        self.assertEqual(result["value"], 23.5)

    def test_query_last_returns_none_when_empty(self):
        self.mock_query_api.query.return_value = []
        result = self.ops.query_last("temperature", "value")
        self.assertIsNone(result)

    def test_query_aggregation_builds_flux(self):
        self.mock_query_api.query.return_value = []
        self.ops.query_aggregation("temp", "value", aggregation="mean", window="1h")
        flux = self.mock_query_api.query.call_args[0][0]
        self.assertIn("mean", flux)
        self.assertIn("1h", flux)


class TestInfluxDBDelete(_InfluxTestBase):
    """delete 操作测试"""

    def test_delete_with_string_times(self):
        result = self.ops.delete(
            start="2024-01-01T00:00:00Z",
            stop="2024-01-02T00:00:00Z",
            predicate='_measurement="temperature"'
        )
        self.assertTrue(result)
        self.mock_delete_api.delete.assert_called_once()

    def test_delete_with_datetime_times(self):
        start = datetime(2024, 1, 1)
        stop = datetime(2024, 1, 2)
        result = self.ops.delete(start=start, stop=stop)
        self.assertTrue(result)
        call_kwargs = self.mock_delete_api.delete.call_args[1]
        # datetime 被转换为 ISO 字符串 + Z
        self.assertIn("2024-01-01", call_kwargs["start"])
        self.assertIn("2024-01-02", call_kwargs["stop"])

    def test_delete_returns_false_on_error(self):
        self.mock_delete_api.delete.side_effect = Exception("delete error")
        result = self.ops.delete(
            start="2024-01-01T00:00:00Z",
            stop="2024-01-02T00:00:00Z"
        )
        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
