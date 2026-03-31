# -*- coding: utf-8 -*-
"""项目模块序列化"""
from marshmallow import Schema, fields, validate


class ProjectListQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)
    orderby = fields.Str(load_default="")
    project_pm = fields.Str(load_default="")
    group_id = fields.Str(load_default="")


class CreateProjectSchema(Schema):
    project_nm = fields.Str(required=True)
    describe = fields.Str(load_default="")
    department = fields.Str(load_default="")
    product_pm = fields.Str(load_default="")
    project_pm = fields.Str(required=True)
    expected_end_date = fields.Str(load_default="")
    priority = fields.Int(load_default=2)
    group_id = fields.Str(load_default="")
    code_url = fields.Str(load_default="")
    expected_benefit = fields.Str(load_default="")
    reviewer = fields.List(fields.Str(), load_default=[])


class UpdateProjectSchema(Schema):
    project_nm = fields.Str()
    describe = fields.Str()
    department = fields.Str()
    product_pm = fields.Str()
    project_pm = fields.Str()
    expected_end_date = fields.Str()
    priority = fields.Int()
    group_id = fields.Str()
    code_url = fields.Str()
    expected_benefit = fields.Str()


class SetStatusSchema(Schema):
    status = fields.Int(required=True)


class SubmitReviewSchema(Schema):
    reviewer = fields.List(fields.Str(), required=True)
    status = fields.Int(required=True)


class AddFunctionSchema(Schema):
    function_nm = fields.Str(required=True)
    describe = fields.Str(load_default="")
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")
    priority = fields.Int(load_default=2)
    group1 = fields.Str(load_default="")
    group2 = fields.Str(load_default="")
    reviewer = fields.List(fields.Str(), load_default=[])


class UpdateFunctionSchema(Schema):
    function_nm = fields.Str()
    describe = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    priority = fields.Int()
    group1 = fields.Str()
    group2 = fields.Str()


class FunctionListQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)


class FunctionAllocationSchema(Schema):
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")
    responsible = fields.List(fields.Str(), required=True)


class CreateProgressSchema(Schema):
    progress = fields.Int(required=True, validate=validate.Range(min=0, max=100))
    progress_record = fields.Str(load_default="")
    time_consum = fields.Float(load_default=0)
    cooperator = fields.List(fields.Str(), load_default=[])
    start_time = fields.Str(load_default="")


class ProgressQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    unread = fields.Int(load_default=0)


class ReviewQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class ReviewActionSchema(Schema):
    status = fields.Int(required=True, validate=validate.OneOf([2, 3, 4]))
    reject_reason = fields.Str(load_default="")


class CountersignSchema(Schema):
    approver_work_no = fields.Str(required=True)
    approver_name = fields.Str(required=True)


class CreateMilestoneSchema(Schema):
    name = fields.Str(required=True)
    target_date = fields.Str(required=True)
    note = fields.Str(load_default="")
    linked_functions = fields.List(fields.Str(), load_default=[])


class UpdateMilestoneSchema(Schema):
    name = fields.Str()
    target_date = fields.Str()
    status = fields.Str()
    note = fields.Str()
    linked_functions = fields.List(fields.Str())
    achieved_at = fields.Str()


class MemberDynamicsQuerySchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
