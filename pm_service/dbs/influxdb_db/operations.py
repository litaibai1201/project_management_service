# -*- coding: utf-8 -*-
"""
@文件: operations.py
@说明: InfluxDB 操作封装
@时间: 2025-09-03

使用示例:
    from dbs.influxdb_db import InfluxDBOperations

    # 创建操作实例
    ops = InfluxDBOperations("my_bucket")

    # 写入数据
    ops.write_point(
        measurement="temperature",
        tags={"location": "room1", "sensor": "sensor1"},
        fields={"value": 23.5, "humidity": 60},
    )

    # 查询数据
    results = ops.query('''
        from(bucket: "my_bucket")
            |> range(start: -1h)
            |> filter(fn: (r) => r._measurement == "temperature")
    ''')
"""
from typing import Any, Dict, List, Optional, Union
from datetime import datetime, timedelta

try:
    from influxdb_client import Point, WritePrecision
    from influxdb_client.client.write_api import SYNCHRONOUS
    INFLUXDB_AVAILABLE = True
except ImportError:
    INFLUXDB_AVAILABLE = False
    Point = None
    WritePrecision = None
    SYNCHRONOUS = None

from .client import influx_client
from loggers import logger


class InfluxDBOperations:
    """InfluxDB 操作封装类

    提供常用的写入、查询、删除操作
    """

    def __init__(self, bucket: str = None, org: str = None):
        """初始化

        Args:
            bucket: Bucket 名称，为空则使用默认 Bucket
            org: 组织名称，为空则使用默认组织
        """
        if not INFLUXDB_AVAILABLE:
            raise ImportError(
                "InfluxDB 客户端库未安装，请运行: pip install influxdb-client"
            )

        self._bucket = bucket or influx_client.bucket
        self._org = org or influx_client.org

    @property
    def bucket(self) -> str:
        """获取 Bucket 名称"""
        return self._bucket

    @property
    def org(self) -> str:
        """获取组织名称"""
        return self._org

    # ==================== 写入操作 ====================

    def write_point(
        self,
        measurement: str,
        fields: Dict[str, Any],
        tags: Optional[Dict[str, str]] = None,
        timestamp: Optional[datetime] = None,
        precision: str = WritePrecision.NS,
    ) -> bool:
        """写入单个数据点

        Args:
            measurement: 测量名称（类似表名）
            fields: 字段数据（数值类型）
            tags: 标签数据（字符串类型，用于索引）
            timestamp: 时间戳，默认为当前时间
            precision: 时间精度（NS/US/MS/S）

        Returns:
            是否写入成功

        示例:
            ops.write_point(
                measurement="temperature",
                tags={"location": "room1", "sensor": "sensor1"},
                fields={"value": 23.5, "humidity": 60},
            )
        """
        try:
            point = Point(measurement)

            # 添加标签
            if tags:
                for key, value in tags.items():
                    point = point.tag(key, str(value))

            # 添加字段
            for key, value in fields.items():
                point = point.field(key, value)

            # 设置时间戳
            if timestamp:
                point = point.time(timestamp, precision)

            # 写入
            write_api = influx_client.get_write_api(write_options=SYNCHRONOUS)
            write_api.write(bucket=self._bucket, org=self._org, record=point)

            return True
        except Exception as e:
            logger.error(
                f"InfluxDB 写入失败",
                category="error",
                event="influxdb_write_failed",
                error=e,
                custom={
                    "measurement": measurement,
                    "bucket": self._bucket,
                }
            )
            return False

    def write_points(
        self,
        points: List[Dict[str, Any]],
        precision: str = WritePrecision.NS,
    ) -> bool:
        """批量写入数据点

        Args:
            points: 数据点列表
            precision: 时间精度

        Returns:
            是否写入成功

        示例:
            ops.write_points([
                {
                    "measurement": "temperature",
                    "tags": {"location": "room1"},
                    "fields": {"value": 23.5},
                    "timestamp": datetime.now(),
                },
                {
                    "measurement": "temperature",
                    "tags": {"location": "room2"},
                    "fields": {"value": 24.0},
                },
            ])
        """
        try:
            point_objects = []

            for point_data in points:
                measurement = point_data.get("measurement")
                if not measurement:
                    logger.warning("数据点缺少 measurement 字段，跳过")
                    continue

                point = Point(measurement)

                # 添加标签
                tags = point_data.get("tags", {})
                for key, value in tags.items():
                    point = point.tag(key, str(value))

                # 添加字段
                fields = point_data.get("fields", {})
                for key, value in fields.items():
                    point = point.field(key, value)

                # 设置时间戳
                timestamp = point_data.get("timestamp")
                if timestamp:
                    point = point.time(timestamp, precision)

                point_objects.append(point)

            # 批量写入
            write_api = influx_client.get_write_api(write_options=SYNCHRONOUS)
            write_api.write(bucket=self._bucket, org=self._org, record=point_objects)

            return True
        except Exception as e:
            logger.error(
                f"InfluxDB 批量写入失败",
                category="error",
                event="influxdb_batch_write_failed",
                error=e,
                custom={"bucket": self._bucket, "count": len(points)}
            )
            return False

    def write_dict(
        self,
        measurement: str,
        data: Dict[str, Any],
        tag_keys: Optional[List[str]] = None,
        timestamp_key: str = "time",
        precision: str = WritePrecision.NS,
    ) -> bool:
        """从字典写入数据

        Args:
            measurement: 测量名称
            data: 数据字典
            tag_keys: 作为标签的键列表
            timestamp_key: 时间戳键名
            precision: 时间精度

        Returns:
            是否写入成功

        示例:
            ops.write_dict(
                measurement="temperature",
                data={
                    "location": "room1",
                    "sensor": "sensor1",
                    "value": 23.5,
                    "humidity": 60,
                    "time": datetime.now(),
                },
                tag_keys=["location", "sensor"],
            )
        """
        tags = {}
        fields = {}
        timestamp = None

        tag_keys = tag_keys or []

        for key, value in data.items():
            if key == timestamp_key:
                timestamp = value
            elif key in tag_keys:
                tags[key] = str(value)
            else:
                fields[key] = value

        return self.write_point(
            measurement=measurement,
            fields=fields,
            tags=tags,
            timestamp=timestamp,
            precision=precision,
        )

    # ==================== 查询操作 ====================

    def query(self, flux_query: str) -> List[Dict[str, Any]]:
        """执行 Flux 查询

        Args:
            flux_query: Flux 查询语句

        Returns:
            查询结果列表

        示例:
            results = ops.query('''
                from(bucket: "my_bucket")
                    |> range(start: -1h)
                    |> filter(fn: (r) => r._measurement == "temperature")
                    |> filter(fn: (r) => r._field == "value")
            ''')
        """
        try:
            query_api = influx_client.get_query_api()
            tables = query_api.query(flux_query, org=self._org)

            results = []
            for table in tables:
                for record in table.records:
                    results.append({
                        "measurement": record.get_measurement(),
                        "field": record.get_field(),
                        "value": record.get_value(),
                        "time": record.get_time(),
                        "tags": record.values,
                    })

            return results
        except Exception as e:
            logger.error(
                "InfluxDB 查询失败",
                category="error",
                event="influxdb_query_failed",
                error=e,
                custom={"query": flux_query}
            )
            return []

    def query_range(
        self,
        measurement: str,
        field: str,
        start: Union[str, datetime, timedelta] = "-1h",
        stop: Optional[Union[str, datetime]] = None,
        filters: Optional[Dict[str, str]] = None,
    ) -> List[Dict[str, Any]]:
        """范围查询

        Args:
            measurement: 测量名称
            field: 字段名称
            start: 开始时间（支持相对时间如 "-1h"，或 datetime 对象）
            stop: 结束时间（默认为当前时间）
            filters: 标签过滤条件

        Returns:
            查询结果列表

        示例:
            # 查询最近 1 小时的温度数据
            results = ops.query_range(
                measurement="temperature",
                field="value",
                start="-1h",
                filters={"location": "room1"}
            )
        """
        # 构建时间范围
        if isinstance(start, timedelta):
            start_str = f"-{int(start.total_seconds())}s"
        elif isinstance(start, datetime):
            start_str = start.isoformat() + "Z"
        else:
            start_str = start

        if stop:
            if isinstance(stop, datetime):
                stop_str = stop.isoformat() + "Z"
            else:
                stop_str = stop
            range_clause = f'range(start: {start_str}, stop: {stop_str})'
        else:
            range_clause = f'range(start: {start_str})'

        # 构建过滤条件
        filter_clauses = [
            f'filter(fn: (r) => r._measurement == "{measurement}")',
            f'filter(fn: (r) => r._field == "{field}")',
        ]

        if filters:
            for tag_key, tag_value in filters.items():
                filter_clauses.append(
                    f'filter(fn: (r) => r.{tag_key} == "{tag_value}")'
                )

        # 构建完整查询
        flux_query = f'''
            from(bucket: "{self._bucket}")
                |> {range_clause}
                |> {' |> '.join(filter_clauses)}
        '''

        return self.query(flux_query)

    def query_last(
        self,
        measurement: str,
        field: str,
        filters: Optional[Dict[str, str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """查询最新数据点

        Args:
            measurement: 测量名称
            field: 字段名称
            filters: 标签过滤条件

        Returns:
            最新数据点
        """
        # 构建过滤条件
        filter_clauses = [
            f'filter(fn: (r) => r._measurement == "{measurement}")',
            f'filter(fn: (r) => r._field == "{field}")',
        ]

        if filters:
            for tag_key, tag_value in filters.items():
                filter_clauses.append(
                    f'filter(fn: (r) => r.{tag_key} == "{tag_value}")'
                )

        # 构建查询
        flux_query = f'''
            from(bucket: "{self._bucket}")
                |> range(start: -30d)
                |> {' |> '.join(filter_clauses)}
                |> last()
        '''

        results = self.query(flux_query)
        return results[0] if results else None

    def query_aggregation(
        self,
        measurement: str,
        field: str,
        aggregation: str = "mean",
        window: str = "1h",
        start: str = "-24h",
        filters: Optional[Dict[str, str]] = None,
    ) -> List[Dict[str, Any]]:
        """聚合查询

        Args:
            measurement: 测量名称
            field: 字段名称
            aggregation: 聚合函数（mean/sum/count/min/max/median）
            window: 时间窗口
            start: 开始时间
            filters: 标签过滤条件

        Returns:
            聚合结果列表

        示例:
            # 查询每小时平均温度
            results = ops.query_aggregation(
                measurement="temperature",
                field="value",
                aggregation="mean",
                window="1h",
                start="-24h"
            )
        """
        # 构建过滤条件
        filter_clauses = [
            f'filter(fn: (r) => r._measurement == "{measurement}")',
            f'filter(fn: (r) => r._field == "{field}")',
        ]

        if filters:
            for tag_key, tag_value in filters.items():
                filter_clauses.append(
                    f'filter(fn: (r) => r.{tag_key} == "{tag_value}")'
                )

        # 构建查询
        flux_query = f'''
            from(bucket: "{self._bucket}")
                |> range(start: {start})
                |> {' |> '.join(filter_clauses)}
                |> aggregateWindow(every: {window}, fn: {aggregation})
        '''

        return self.query(flux_query)

    # ==================== 删除操作 ====================

    def delete(
        self,
        start: Union[str, datetime],
        stop: Union[str, datetime],
        predicate: str = "",
    ) -> bool:
        """删除数据

        Args:
            start: 开始时间
            stop: 结束时间
            predicate: 删除条件（Flux 语法）

        Returns:
            是否删除成功

        示例:
            # 删除指定时间范围的数据
            ops.delete(
                start=datetime(2024, 1, 1),
                stop=datetime(2024, 1, 2),
                predicate='_measurement="temperature" AND location="room1"'
            )
        """
        try:
            # 转换时间格式
            if isinstance(start, datetime):
                start = start.isoformat() + "Z"
            if isinstance(stop, datetime):
                stop = stop.isoformat() + "Z"

            delete_api = influx_client.get_delete_api()
            delete_api.delete(
                start=start,
                stop=stop,
                predicate=predicate,
                bucket=self._bucket,
                org=self._org,
            )

            logger.info(
                "InfluxDB 数据删除成功",
                category="business",
                event="influxdb_delete_success",
                custom={
                    "bucket": self._bucket,
                    "start": start,
                    "stop": stop,
                    "predicate": predicate,
                }
            )
            return True
        except Exception as e:
            logger.error(
                "InfluxDB 数据删除失败",
                category="error",
                event="influxdb_delete_failed",
                error=e
            )
            return False


__all__ = ["InfluxDBOperations"]
