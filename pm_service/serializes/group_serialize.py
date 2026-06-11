# -*- coding: utf-8 -*-
"""分组/成员管理序列化"""
from marshmallow import fields
from serializes.base_schema import BaseSchema


class MemberQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")


class MemberListQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class StatDataSchema(BaseSchema):
    start_date = fields.Str(required=True)
    end_date = fields.Str(required=True)


class SendReportSchema(BaseSchema):
    start_date = fields.Str(required=True)
    end_date = fields.Str(required=True)
    email = fields.Str(load_default="")


class ScheduleQuerySchema(BaseSchema):
    start_date = fields.Str(load_default="")
    end_date = fields.Str(load_default="")
