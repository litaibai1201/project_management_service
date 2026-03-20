# -*- coding: utf-8 -*-
"""搜索模块序列化"""
from marshmallow import Schema, fields


class SearchSchema(Schema):
    keyword = fields.Str(required=True)
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    type = fields.Str(load_default="")  # "project" | "duty" | ""
