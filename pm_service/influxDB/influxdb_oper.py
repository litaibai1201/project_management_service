# -*- coding: utf-8 -*-
"""
@文件: influxdb_oper.py
@說明:
@時間: 2024/05/31 13:42:06
@作者: LiDong
"""
import json
import traceback

from influxdb_client import InfluxDBClient
from influxdb_client.client.exceptions import InfluxDBError
from influxdb_client.client.write_api import SYNCHRONOUS

from common.common_tools import CommonTools
from configs.db_config import db_config_dict


class OperInfluxDB:
    def __init__(self) -> None:
        self.db_client = None
        self.record_bucket = db_config_dict["influxdb"]["bucket"]

    def connect_to_influxdb(self):
        token = db_config_dict["influxdb"]["token"]
        org = db_config_dict["influxdb"]["org"]
        url = db_config_dict["influxdb"]["url"]
        self.db_client = InfluxDBClient(url=url, token=token, org=org)

    def __write_data(self, bucket, data):
        write_api = self.db_client.write_api(write_options=SYNCHRONOUS)
        write_api.write(bucket=bucket, record=data)

    def add_record(self, user, action, status, details, ip):
        record = {
            "user": user,
            "action": action,
            "status": status,
            "details": details,
            "remote_addr": ip,
            "created_at": CommonTools.get_now()
        }
        data = {
            "measurement": "operations_log",
            "fields": {"data_dict": json.dumps(record, ensure_ascii=False)},
        }
        return self.write_to_influxdb(self.record_bucket, data)

    def write_to_influxdb(self, bucket_name, data):
        try:
            self.__write_data(bucket_name, data)
            print(">>> record to influxdb success")
            return "record to influxdb success", True
        except InfluxDBError:
            self.connect_to_influxdb()
            self.__write_data(bucket_name, data)
            return "record to influxdb success", True
        except Exception as e:
            return e, False

    def last_data_within_period(self, bucket, measurement, period):
        query_api = self.db_client.query_api()
        query = f'from(bucket:"{bucket}") |> range(start: -{5*period}s) |> filter(fn: (r) => r["_measurement"] == "{measurement}") |> last()'
        tables = query_api.query(org="monitor_system", query=query)
        if tables:
            return tables
        return False

    def disconnect_from_influxdb(self):
        if self.db_client:
            self.db_client.close()
            print(">>> influxdb: close")


oper_fluxdb = OperInfluxDB()
