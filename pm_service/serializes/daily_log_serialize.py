# -*- coding: utf-8 -*-
"""日报模块序列化"""
from marshmallow import fields
from serializes.base_schema import BaseSchema


class TaskItemSchema(BaseSchema):
    task_type = fields.Str(required=True)   # project | duty
    task_id = fields.Str(required=True)
    task_nm = fields.Str(load_default="")
    work_hours = fields.Float(required=True)
    description = fields.Str(load_default="")
    progress = fields.Int(load_default=None, allow_none=True)
    is_overtime = fields.Bool(load_default=False)
    overtime_hours = fields.Float(load_default=0)
    source = fields.Str(load_default=None, allow_none=True)
    suggest_id = fields.Str(load_default=None, allow_none=True)
    record_time = fields.Str(load_default=None, allow_none=True)
    project_id = fields.Str(load_default=None, allow_none=True)
    project_nm = fields.Str(load_default=None, allow_none=True)
    system_nm = fields.Str(load_default=None, allow_none=True)
    requirement_nm = fields.Str(load_default=None, allow_none=True)
    group1 = fields.Str(load_default=None, allow_none=True)
    group2 = fields.Str(load_default=None, allow_none=True)
    expected_start_date = fields.Str(load_default=None, allow_none=True)
    expected_end_date = fields.Str(load_default=None, allow_none=True)
    files = fields.List(fields.Dict(), load_default=None, allow_none=True)


class FreeItemSchema(BaseSchema):
    category = fields.Str(required=True)
    description = fields.Str(load_default="")
    work_hours = fields.Float(required=True)
    is_overtime = fields.Bool(load_default=False)
    overtime_hours = fields.Float(load_default=0)
    source = fields.Str(load_default=None, allow_none=True)
    record_time = fields.Str(load_default=None, allow_none=True)
    project_id = fields.Str(load_default=None, allow_none=True)
    project_nm = fields.Str(load_default=None, allow_none=True)
    function_id = fields.Str(load_default=None, allow_none=True)
    function_nm = fields.Str(load_default=None, allow_none=True)
    files = fields.List(fields.Dict(), load_default=None, allow_none=True)


class CreateDailyLogSchema(BaseSchema):
    log_date = fields.Str(required=True)
    task_items = fields.List(fields.Nested(TaskItemSchema), load_default=[])
    free_items = fields.List(fields.Nested(FreeItemSchema), load_default=[])
    remark = fields.Str(load_default="")


class UpdateDailyLogSchema(BaseSchema):
    task_items = fields.List(fields.Nested(TaskItemSchema))
    free_items = fields.List(fields.Nested(FreeItemSchema))
    remark = fields.Str()
    status = fields.Int()   # 1=草稿 2=已提交


class DailyLogQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    start_date = fields.Str(load_default="")
    end_date = fields.Str(load_default="")
    work_no = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)


class StatisticsQuerySchema(BaseSchema):
    start_date = fields.Str(load_default="")
    end_date = fields.Str(load_default="")


class SyncTaskProgressSchema(BaseSchema):
    task_type = fields.Str(required=True)
    task_id = fields.Str(required=True)
    progress = fields.Int(required=True)


class RevertTaskProgressSchema(BaseSchema):
    task_type = fields.Str(required=True)
    task_id = fields.Str(required=True)


class SuggestQuerySchema(BaseSchema):
    date = fields.Str(load_default="")


class TaskEntriesQuerySchema(BaseSchema):
    task_type = fields.Str(load_default="project")
    task_id = fields.Str(load_default="")
