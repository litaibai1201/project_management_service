# -*- coding: utf-8 -*-
"""统计接口序列化"""
from marshmallow import fields
from serializes.base_schema import BaseSchema


class DateRangeQuerySchema(BaseSchema):
    start_date = fields.Str(load_default=None, allow_none=True)
    end_date = fields.Str(load_default=None, allow_none=True)


class PersonalStatsQuerySchema(BaseSchema):
    work_no = fields.Str(load_default=None, allow_none=True)
    start_date = fields.Str(load_default=None, allow_none=True)
    end_date = fields.Str(load_default=None, allow_none=True)


class ProgressReportQuerySchema(BaseSchema):
    start_date = fields.Str(load_default="")
    end_date = fields.Str(load_default="")
