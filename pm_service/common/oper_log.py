# -*- coding: utf-8 -*-
"""
@文件: oper_log.py
@說明: 操作審計日誌 — 寫入 MySQL（替代原 InfluxDB 方案）
@時間: 2026/03/19
@作者: LiDong
"""
from common.common_tools import get_timestamp
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import OperRecordModel


def add_operation_record(operator: str, action: str, status: str,
                         matter: str, ip: str = '', matter_id: str = '') -> None:
    """
    寫入一條操作審計記錄到 MySQL oper_record_form 表。
    失敗時靜默處理，不影響主業務流程。

    Args:
        operator:  操作人工號
        action:    操作類型，如 login / create_project / delete_function 等
        status:    結果，如 success / fail
        matter:    操作詳情描述
        ip:        客戶端 IP（可選）
        matter_id: 關聯實體 ID（專案ID、任務ID等，可選）
    """
    try:
        ip_info = f" [{ip}]" if ip else ""
        record = OperRecordModel(
            operator=operator,
            action=action,
            matter=f"[{status}]{ip_info} {matter}",
            matter_id=matter_id or "",
        )
        db.session.add(record)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print(f">>> oper_log write failed: {exc}")
