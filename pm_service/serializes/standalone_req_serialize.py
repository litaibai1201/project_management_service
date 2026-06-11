# -*- coding: utf-8 -*-
"""独立需求序列化"""
from marshmallow import fields
from serializes.base_schema import BaseSchema


class ReqListQuerySchema(BaseSchema):
    keyword = fields.Str(load_default="")
    status = fields.Int(load_default=None, allow_none=True)
    priority = fields.Int(load_default=None, allow_none=True)
    responsible = fields.Str(load_default="")
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class CreateReqSchema(BaseSchema):
    req_nm = fields.Str(required=True)
    describe = fields.Str(load_default="")
    priority = fields.Int(load_default=2)
    responsible = fields.List(fields.Str(), load_default=[])
    expected_start_date = fields.Str(load_default="")
    expected_end_date = fields.Str(load_default="")


class UpdateReqSchema(BaseSchema):
    req_nm = fields.Str()
    describe = fields.Str()
    priority = fields.Int()
    responsible = fields.List(fields.Str())
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()


class SubmitReviewSchema(BaseSchema):
    reviewer = fields.Raw(load_default=[])
    submitter_name = fields.Str(load_default="")


class BatchSubmitReviewSchema(BaseSchema):
    req_ids = fields.List(fields.Str(), load_default=[])
    reviewer = fields.Raw(load_default=[])
    submitter_name = fields.Str(load_default="")


class ReviewResultSchema(BaseSchema):
    status = fields.Int(load_default=None, allow_none=True)
    reject_reason = fields.Str(load_default="")


class DeleteFileSchema(BaseSchema):
    file_id = fields.Str(load_default="")
