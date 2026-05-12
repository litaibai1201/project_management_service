# -*- coding: utf-8 -*-
"""临时任务模块序列化"""
from marshmallow import Schema, fields, validate


class DutyListQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)
    priority = fields.Int(load_default=None, allow_none=True)
    responsible = fields.Str(load_default="")


class CreateDutySchema(Schema):
    duty_nm = fields.Str(required=True)
    describe = fields.Str(load_default="")
    group = fields.Str(load_default="")
    project_id = fields.Str(load_default="")
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")
    priority = fields.Int(load_default=2)
    responsible = fields.List(fields.Str(), load_default=[])


class UpdateDutySchema(Schema):
    duty_nm = fields.Str()
    describe = fields.Str()
    group = fields.Str()
    project_id = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    priority = fields.Int()
    responsible = fields.List(fields.Str())


class DutyAllocationSchema(Schema):
    responsible = fields.List(fields.Str())
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")


class SetStatusSchema(Schema):
    status = fields.Int(required=True)


class CreateDutyProgressSchema(Schema):
    progress = fields.Int(required=True, validate=validate.Range(min=0, max=100))
    progress_record = fields.Str(load_default="")
    time_consum = fields.Float(load_default=0)
    cooperator = fields.List(fields.Str(), load_default=[])
    start_time = fields.Str(load_default="")


class ProgressQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class ReviewActionSchema(Schema):
    status = fields.Int(required=True, validate=validate.OneOf([2, 3, 4]))
    reject_reason = fields.Str(load_default="")


class CountersignSchema(Schema):
    approver_work_no = fields.Str(required=True)
    approver_name = fields.Str(required=True)
