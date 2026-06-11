# -*- coding: utf-8 -*-
"""
@文件: base_table.py
@说明: 数据表基类
"""
import uuid

from utils.tools import CommonTools
from dbs.mysql_db import db


def generate_uuid():
    return uuid.uuid4().hex


class BaseMixinModel(db.Model):
    __abstract__ = True

    status = db.Column(db.Integer, default=1, comment="状态(1=正常,0=禁用)")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, nullable=False, comment="创建时间")
    update_at = db.Column(db.String(19), comment="更新时间")
    status_update_at = db.Column(db.String(19), comment="状态更新时间")
