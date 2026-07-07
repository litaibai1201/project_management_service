# -*- coding: utf-8 -*-
"""项目模块序列化"""
from marshmallow import fields, validate
from serializes.base_schema import BaseSchema


class ProjectListQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)
    orderby = fields.Str(load_default="")
    project_pm = fields.Str(load_default="")
    group_id = fields.Str(load_default="")
    work_no = fields.Str(load_default="")
    manager_view = fields.Bool(load_default=False)


class CreateProjectSchema(BaseSchema):
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
    region = fields.Str(load_default="")
    campus = fields.Str(load_default="")
    process = fields.Str(load_default="")
    factory = fields.Str(load_default="")


class UpdateProjectSchema(BaseSchema):
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
    region = fields.Str()
    campus = fields.Str()
    process = fields.Str()
    factory = fields.Str()


class SetStatusSchema(BaseSchema):
    status = fields.Int(required=True)
    reason = fields.Str(load_default="")


class SubmitReviewSchema(BaseSchema):
    reviewer = fields.List(fields.Str(), required=True)
    status = fields.Int(required=True)


class AddFunctionSchema(BaseSchema):
    function_nm = fields.Str(required=True)
    describe = fields.Str(load_default="")
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")
    priority = fields.Int(load_default=2)
    group1 = fields.Str(load_default="")
    group2 = fields.Str(load_default="")
    reviewer = fields.List(fields.Str(), load_default=[])


class UpdateFunctionSchema(BaseSchema):
    function_nm = fields.Str()
    describe = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    priority = fields.Int()
    group1 = fields.Str()
    group2 = fields.Str()


class FunctionListQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)
    requirement_id = fields.Str(load_default=None, allow_none=True)


class FunctionAllocationSchema(BaseSchema):
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")
    responsible = fields.List(fields.Str(), required=True)


class CreateProgressSchema(BaseSchema):
    progress = fields.Int(required=True, validate=validate.Range(min=0, max=100))
    progress_record = fields.Str(load_default="")
    time_consum = fields.Float(load_default=0)
    cooperator = fields.List(fields.Str(), load_default=[])
    start_time = fields.Str(load_default="")


class ProgressQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    unread = fields.Int(load_default=0)


class ReviewQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class ReviewActionSchema(BaseSchema):
    status = fields.Int(required=True, validate=validate.OneOf([2, 3, 4]))
    reject_reason = fields.Str(load_default="")
    countersigns = fields.List(fields.Dict(), load_default=[])


class CountersignSchema(BaseSchema):
    approver_work_no = fields.Str(required=True)
    approver_name = fields.Str(required=True)


class CreateMilestoneSchema(BaseSchema):
    name = fields.Str(required=True)
    target_date = fields.Str(required=True)
    note = fields.Str(load_default="")
    linked_functions = fields.List(fields.Str(), load_default=[])


class UpdateMilestoneSchema(BaseSchema):
    name = fields.Str()
    target_date = fields.Str()
    status = fields.Str()
    note = fields.Str()
    linked_functions = fields.List(fields.Str())
    achieved_at = fields.Str()


class MemberDynamicsQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class SetProjectPmSchema(BaseSchema):
    project_pm = fields.Str(load_default="")


class MyFunctionsQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    status = fields.Int(load_default=None, allow_none=True)
    scope = fields.Str(load_default="all")


class FunctionRescheduleSchema(BaseSchema):
    new_end_date = fields.Str(load_default="")
    reason = fields.Str(load_default="")


class ChangeRequestSchema(BaseSchema):
    reviewer = fields.List(fields.Str(), load_default=[])
    description = fields.Str(load_default="")


class RequirementReviewSchema(BaseSchema):
    reviewer = fields.List(fields.Str(), load_default=[])


class BatchRequirementReviewSchema(BaseSchema):
    requirement_ids = fields.List(fields.Str(), load_default=[])
    reviewer = fields.List(fields.Str(), load_default=[])


class TaskAdditionReviewSchema(BaseSchema):
    function_ids = fields.List(fields.Str(), load_default=[])
    reviewer = fields.List(fields.Str(), load_default=[])
