# -*- coding: utf-8 -*-
"""AR模块序列化"""
from marshmallow import fields, validate
from serializes.base_schema import BaseSchema


class DutyListQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)
    priority = fields.Int(load_default=None, allow_none=True)
    responsible = fields.Str(load_default="")
    system_id = fields.Str(load_default="")


class CreateDutySchema(BaseSchema):
    duty_nm = fields.Str(required=True)
    describe = fields.Str(load_default="")
    group = fields.Str(load_default="")
    project_id = fields.Str(load_default="")
    system_id = fields.Str(load_default="")
    standalone_req_id = fields.Str(load_default="")
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")
    priority = fields.Int(load_default=2)
    responsible = fields.List(fields.Str(), load_default=[])


class UpdateDutySchema(BaseSchema):
    duty_nm = fields.Str()
    describe = fields.Str()
    group = fields.Str()
    project_id = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    priority = fields.Int()
    responsible = fields.List(fields.Str())


class DutyAllocationSchema(BaseSchema):
    responsible = fields.List(fields.Str())
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")


class SetStatusSchema(BaseSchema):
    status = fields.Int(required=True)


class CreateDutyProgressSchema(BaseSchema):
    progress = fields.Int(required=True, validate=validate.Range(min=0, max=100))
    progress_record = fields.Str(load_default="")
    time_consum = fields.Float(load_default=0)
    cooperator = fields.List(fields.Str(), load_default=[])
    start_time = fields.Str(load_default="")


class ProgressQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class ReviewActionSchema(BaseSchema):
    status = fields.Int(required=True, validate=validate.OneOf([2, 3, 4]))
    reject_reason = fields.Str(load_default="")


class CountersignSchema(BaseSchema):
    approver_work_no = fields.Str(required=True)
    approver_name = fields.Str(required=True)


class DutyRescheduleSchema(BaseSchema):
    new_end_date = fields.Str(load_default="")
    reason = fields.Str(load_default="")


class DutyActivateSchema(BaseSchema):
    """激活任务时可附带的补充字段（全部可选）"""
    responsible = fields.List(fields.Str(), load_default=[])
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")


class DutySetDatesSchema(BaseSchema):
    """首次设定预计日期"""
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")


class DutySubmitCompletionSchema(BaseSchema):
    reviewer = fields.List(fields.Str(), load_default=[])
    submitter_name = fields.Str(load_default="")


class DutyReqTaskReviewSchema(BaseSchema):
    """提交需求任务新增审核"""
    reviewer = fields.List(fields.Str(), load_default=[])
    submitter_name = fields.Str(load_default="")


class BatchReqTaskReviewSchema(BaseSchema):
    duty_ids = fields.List(fields.Str(), load_default=[])
    reviewer = fields.List(fields.Str(), load_default=[])


class ReviewApproveSchema(BaseSchema):
    status = fields.Int(load_default=None, allow_none=True)
    reject_reason = fields.Str(load_default="")
    countersigns = fields.List(fields.Dict(), load_default=[])


class ReviewListQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class TaskListQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
