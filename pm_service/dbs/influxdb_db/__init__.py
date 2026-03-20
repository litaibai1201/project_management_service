# -*- coding: utf-8 -*-
"""
@文件: __init__.py
@说明: InfluxDB 时序数据库模块
@时间: 2025-09-03

InfluxDB 是专为时间序列数据设计的高性能数据库。

使用示例:
    from dbs.influxdb_db import influx_client, InfluxDBOperations, Point

    # 1. 初始化 (在 app.py 中)
    influx_client.init_app(app)

    # 2. 基础操作
    ops = InfluxDBOperations("my_bucket")

    # 写入数据
    ops.write_point(
        measurement="temperature",
        tags={"location": "room1", "sensor": "sensor1"},
        fields={"value": 23.5, "humidity": 60},
    )

    # 查询数据
    results = ops.query_range(
        measurement="temperature",
        field="value",
        start="-1h",
        filters={"location": "room1"}
    )

    # 聚合查询
    results = ops.query_aggregation(
        measurement="temperature",
        field="value",
        aggregation="mean",
        window="1h",
        start="-24h"
    )

核心概念:
    - Measurement: 测量名称（类似关系型数据库的表）
    - Field: 字段（存储实际数值，不索引）
    - Tag: 标签（字符串类型，会被索引，用于快速查询）
    - Timestamp: 时间戳（每个数据点必须有时间戳）
    - Bucket: 数据桶（类似数据库）
    - Organization: 组织（顶级容器）

适用场景:
    - 监控数据：CPU、内存、网络流量
    - 传感器数据：温度、湿度、压力
    - 日志数据：应用日志、访问日志
    - 金融数据：股票价格、交易记录
    - IoT 数据：设备状态、位置信息
"""

from .client import InfluxDBClientManager, influx_client, Point, WritePrecision
from .operations import InfluxDBOperations

__all__ = [
    "InfluxDBClientManager",
    "influx_client",
    "InfluxDBOperations",
    "Point",
    "WritePrecision",
]
