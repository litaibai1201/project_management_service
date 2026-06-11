# -*- coding: utf-8 -*-
"""
@文件: base_schema.py
@说明: Schema 基类，全局忽略未定义字段
"""
from marshmallow import Schema, EXCLUDE


class BaseSchema(Schema):
    class Meta:
        unknown = EXCLUDE
