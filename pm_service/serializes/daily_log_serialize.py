# -*- coding: utf-8 -*-
"""日报模块序列化"""
from marshmallow import Schema, fields


class TaskItemSchema(Schema):
    task_type = fields.Str(required=True)   # project | duty
    task_id = fields.Str(required=True)
    task_nm = fields.Str(load_default="")
    work_hours = fields.Float(required=True)
    description = fields.Str(load_default="")


class FreeItemSchema(Schema):
    category = fields.Str(required=True)
    description = fields.Str(load_default="")
    work_hours = fields.Float(required=True)


class CreateDailyLogSchema(Schema):
    log_date = fields.Str(required=True)
    task_items = fields.List(fields.Nested(TaskItemSchema), load_default=[])
    free_items = fields.List(fields.Nested(FreeItemSchema), load_default=[])
    remark = fields.Str(load_default="")


class UpdateDailyLogSchema(Schema):
    task_items = fields.List(fields.Nested(TaskItemSchema))
    free_items = fields.List(fields.Nested(FreeItemSchema))
    remark = fields.Str()
    status = fields.Int()   # 1=草稿 2=已提交


class DailyLogQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    start_date = fields.Str(load_default="")
    end_date = fields.Str(load_default="")
    work_no = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)


class StatisticsQuerySchema(Schema):
    start_date = fields.Str(load_default="")
    end_date = fields.Str(load_default="")
