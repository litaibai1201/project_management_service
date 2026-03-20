# InfluxDB 使用指南

InfluxDB 是专为时间序列数据设计的高性能数据库，本框架集成了 `InfluxDBOperations`，提供写入、查询和删除能力。

---

## 1. 核心概念

| 概念 | 类比关系型数据库 | 说明 |
|------|----------------|------|
| **Organization** | - | 顶级容器，隔离不同租户 |
| **Bucket** | Database | 数据桶 |
| **Measurement** | Table | 测量名，类似表名 |
| **Tag** | 索引列（字符串） | 会被索引，用于快速过滤；只能存字符串 |
| **Field** | 普通列（数值） | 存储实际数值，不索引 |
| **Timestamp** | 主键 | 每个数据点必须有时间戳 |

### Tag vs Field 的关键区别

- **Tag**：字符串类型，会建索引，适合分类过滤（主机名、区域、环境）；基数不宜过高
- **Field**：数值/字符串/布尔，不索引，适合存储测量值（CPU 使用率、温度）

### 适用场景

- 监控数据：CPU、内存、网络流量
- 传感器数据：温度、湿度、压力
- 金融数据：股票价格、交易记录
- IoT 数据：设备状态、位置信息
- 应用性能：响应时间、吞吐量

---

## 2. 快速开始

### 2.1 配置

```bash
INFLUXDB_URL=http://127.0.0.1:8086
INFLUXDB_TOKEN=your-token-here
INFLUXDB_ORG=my-org
INFLUXDB_BUCKET=my-bucket
INFLUXDB_TIMEOUT=10000
INFLUXDB_VERIFY_SSL=true
```

### 2.2 在 Flask 中初始化

```python
# app.py（按需启用）
from dbs.influxdb_db import influx_client
influx_client.init_app(app)
```

### 2.3 导入模块

```python
from dbs.influxdb_db import InfluxDBOperations
```

---

## 3. 写入数据

### 3.1 写入单个数据点

```python
from dbs.influxdb_db import InfluxDBOperations

ops = InfluxDBOperations("monitoring")   # 指定 Bucket

ops.write_point(
    measurement="cpu_usage",
    tags={
        "host": "server01",
        "region": "cn-east",
        "env": "prod"
    },
    fields={
        "usage_user": 45.2,
        "usage_system": 12.5,
        "usage_idle": 42.3
    }
)
```

### 3.2 批量写入

```python
from datetime import datetime

points = [
    {
        "measurement": "cpu_usage",
        "tags": {"host": "server01", "region": "cn-east"},
        "fields": {"usage_user": 45.2, "usage_system": 12.5},
        "timestamp": datetime.now()
    },
    {
        "measurement": "cpu_usage",
        "tags": {"host": "server02", "region": "cn-north"},
        "fields": {"usage_user": 52.1, "usage_system": 15.3},
    }
]
ops.write_points(points)
```

### 3.3 从字典写入

通过 `tag_keys` 参数指定哪些键作为 Tag，其余键自动作为 Field：

```python
ops.write_dict(
    measurement="sensor_data",
    data={
        "location": "room1",      # Tag（在 tag_keys 中）
        "sensor_id": "s001",      # Tag（在 tag_keys 中）
        "temperature": 23.5,      # Field
        "humidity": 60,           # Field
        "time": datetime.now()    # 时间戳（timestamp_key 默认为 "time"）
    },
    tag_keys=["location", "sensor_id"]
)
```

---

## 4. 查询数据

### 4.1 Flux 查询（完全控制）

```python
results = ops.query('''
    from(bucket: "monitoring")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "cpu_usage")
        |> filter(fn: (r) => r._field == "usage_user")
        |> filter(fn: (r) => r.host == "server01")
''')

# 每条结果结构: {"measurement": ..., "field": ..., "value": ..., "time": ..., "tags": {...}}
for record in results:
    print(f"时间: {record['time']}, 值: {record['value']}")
```

### 4.2 范围查询（简化版）

```python
from datetime import datetime, timedelta

# 最近 1 小时
results = ops.query_range(
    measurement="cpu_usage",
    field="usage_user",
    start="-1h",
    filters={"host": "server01"}
)

# 指定时间范围
results = ops.query_range(
    measurement="cpu_usage",
    field="usage_user",
    start=datetime.now() - timedelta(hours=24),
    stop=datetime.now(),
    filters={"host": "server01", "region": "cn-east"}
)

# 使用 timedelta（最近 24 小时）
results = ops.query_range(
    measurement="cpu_usage",
    field="usage_user",
    start=timedelta(hours=24),
)
```

### 4.3 查询最新数据点

```python
latest = ops.query_last(
    measurement="cpu_usage",
    field="usage_user",
    filters={"host": "server01"}
)

if latest:
    print(f"最新 CPU 使用率: {latest['value']}%")
```

### 4.4 聚合查询

```python
# 每小时平均 CPU 使用率
results = ops.query_aggregation(
    measurement="cpu_usage",
    field="usage_user",
    aggregation="mean",  # 支持: mean / sum / count / min / max / median
    window="1h",         # 时间窗口
    start="-24h",
    filters={"host": "server01"}
)

# 每 5 分钟最大值
results = ops.query_aggregation(
    measurement="cpu_usage",
    field="usage_user",
    aggregation="max",
    window="5m",
    start="-1h"
)
```

### 4.5 复杂 Flux 查询

```python
# 计算变化率（网络流量速率）
results = ops.query('''
    from(bucket: "monitoring")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "network_traffic")
        |> filter(fn: (r) => r._field == "bytes_sent")
        |> derivative(unit: 1s, nonNegative: true)
''')

# 多字段同时查询（pivot 将字段转为列）
results = ops.query('''
    from(bucket: "monitoring")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "system")
        |> filter(fn: (r) => r._field == "cpu" or r._field == "memory")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
''')

# 分组统计（按区域汇总请求数）
results = ops.query('''
    from(bucket: "monitoring")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "requests")
        |> filter(fn: (r) => r._field == "count")
        |> group(columns: ["region"])
        |> sum()
''')
```

---

## 5. 删除数据

```python
from datetime import datetime

# 删除指定时间范围的特定条件数据
ops.delete(
    start=datetime(2024, 1, 1),
    stop=datetime(2024, 1, 2),
    predicate='_measurement="cpu_usage" AND host="server01"'
)

# 删除整个 measurement 的历史数据
ops.delete(
    start=datetime(2020, 1, 1),
    stop=datetime.now(),
    predicate='_measurement="old_metric"'
)
```

---

## 6. 在 MVC 中集成

### Model 层

```python
# models/metrics_model.py
from typing import Dict, List, Optional
from dbs.influxdb_db import InfluxDBOperations

class MetricsModel:
    def __init__(self):
        self.ops = InfluxDBOperations("monitoring")

    def write_cpu(self, host: str, region: str, user: float, system: float) -> bool:
        return self.ops.write_point(
            measurement="cpu_usage",
            tags={"host": host, "region": region},
            fields={"usage_user": user, "usage_system": system}
        )

    def get_cpu_trend(self, host: str, start: str = "-1h") -> List[Dict]:
        return self.ops.query_range(
            measurement="cpu_usage",
            field="usage_user",
            start=start,
            filters={"host": host}
        )

    def get_cpu_avg(self, host: str, window: str = "5m", start: str = "-1h") -> List[Dict]:
        return self.ops.query_aggregation(
            measurement="cpu_usage",
            field="usage_user",
            aggregation="mean",
            window=window,
            start=start,
            filters={"host": host}
        )
```

### Controller 层

```python
# controllers/metrics_controller.py
from models.metrics_model import MetricsModel
from utils.exceptions import ValidationException

class MetricsController:
    def __init__(self):
        self.model = MetricsModel()

    def record_cpu(self, data: Dict) -> bool:
        host = data.get("host")
        region = data.get("region")
        if not host or not region:
            raise ValidationException(msg="host 和 region 不能为空")
        return self.model.write_cpu(host, region, data["user"], data["system"])

    def get_host_metrics(self, host: str, interval: str = "1h") -> Dict:
        return {
            "host": host,
            "trend": self.model.get_cpu_trend(host, start=f"-{interval}"),
            "avg": self.model.get_cpu_avg(host, window="5m", start=f"-{interval}")
        }
```

### View 层

```python
# views/metrics_api.py
from flask.views import MethodView
from flask_smorest import Blueprint
from controllers.metrics_controller import MetricsController
from utils.response import response_result

blp = Blueprint("metrics", __name__, description="监控指标接口")

@blp.route("/cpu")
class CPUMetricsApi(MethodView):
    def __init__(self):
        self.controller = MetricsController()

    def get(self):
        """查询 CPU 指标（Query 参数: host, interval）"""
        host = request.args.get("host")
        interval = request.args.get("interval", "1h")
        data = self.controller.get_host_metrics(host, interval)
        return response_result(content=data)

    def post(self):
        """上报 CPU 指标"""
        success = self.controller.record_cpu(request.get_json())
        return response_result(msg="上报成功" if success else "上报失败")
```

---

## 7. 最佳实践

1. **Tag vs Field 选择**：分类过滤字段（主机名、环境）用 Tag；测量数值（CPU 率、温度）用 Field；不要把高基数值（用户 ID、请求 ID）放 Tag
2. **批量写入**：大量数据点优先用 `write_points()`，避免循环调用 `write_point()`
3. **Measurement 命名**：使用小写+下划线（`cpu_usage`、`network_traffic`），避免中文或特殊字符
4. **设置数据保留策略**：在 InfluxDB 管理界面或 CLI 配置 Bucket 的 retention，避免历史数据无限增长：
   ```bash
   influx bucket update --name monitoring --retention 30d
   ```
5. **聚合查询替代原始查询**：查看趋势时用 `query_aggregation()` 而非 `query_range()` 获取原始数据，减少数据量
6. **不适合 InfluxDB 的场景**：用户信息、订单数据等结构化数据用 MySQL；不支持高效更新已有数据点（InfluxDB 以追加写为主）
