# -*- coding: utf-8 -*-
"""分组/成员管理序列化"""
from marshmallow import Schema, fields


class MemberQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")


class MemberListQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class StatDataSchema(Schema):
    start_date = fields.Str(required=True)
    end_date = fields.Str(required=True)


class SendReportSchema(Schema):
    start_date = fields.Str(required=True)
    end_date = fields.Str(required=True)
    email = fields.Str(load_default="")


class ScheduleQuerySchema(Schema):
    start_date = fields.Str(load_default="")
    end_date = fields.Str(load_default="")
