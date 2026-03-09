# -*- coding: utf-8 -*-
"""
@文件: serializes.py
@說明:
@時間: 2024/03/06 16:01:01
@作者: LiDong
"""


from marshmallow import Schema, fields, validate


class TaskListSchema(Schema):
    status = fields.Int(validate=validate.OneOf([1, 2, 3, 4, 8]))
    page = fields.Int(validate=validate.Range(min=1))
    size = fields.Int(validate=validate.Range(min=5))


class PageAndSizeSchema(Schema):
    page = fields.Int(validate=validate.Range(min=1))
    size = fields.Int(validate=validate.Range(min=5))
    unread = fields.Int()


class ModifyProgressSchema(Schema):
    progress = fields.Int(required=True)
    progress_record = fields.Str(required=True)
    cooperator = fields.List(fields.Str())
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="images"))
    start_time = fields.Str()
    time_consum = fields.Str(required=True)


class ReviewApplySchema(Schema):
    result = fields.Str(validate=validate.OneOf(["0", "1"]), required=True)
    remark = fields.Str()


class CreateTemporaryDutySchema(Schema):
    duty_nm = fields.Str(required=True)
    describe = fields.Str(required=True)
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="images"))
    videos = fields.List(fields.Raw(type="videos"))
    responsible = fields.List(fields.Str())
    code_url = fields.Str()
    department = fields.Str(required=True)
    priority = fields.Int(required=True)
    reviewer = fields.List(fields.Str())


class UpdateTemporaryDutySchema(Schema):
    duty_nm = fields.Str()
    describe = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="images"))
    videos = fields.List(fields.Raw(type="videos"))
    responsible = fields.List(fields.Str())
    code_url = fields.Str()
    department = fields.Str()
    priority = fields.Integer(
        validate=validate.OneOf(
            [1, 2],
            error="status must be number 1 or 2",
        ),
    )


class UploadSchema(Schema):
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="images"))
    videos = fields.List(fields.Raw(type="videos"))


class AllocationTemporaryDutySchema(Schema):
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    responsible = fields.List(fields.Str())


class TemporaryDutyListSchema(Schema):
    page = fields.Int(validate=validate.Range(min=1))
    size = fields.Int(validate=validate.Range(min=5))
    keyword = fields.Str(validate=validate.Length(min=1))
    creator = fields.Str(validate=validate.Length(min=1))
    status = fields.Int(validate=validate.Range(min=0))
    responsible = fields.Str(validate=validate.Length(min=1))
    orderby = fields.List(fields.Dict())


class TaskSetStatusSchema(Schema):
    status = fields.Int(required=True, validate=validate.OneOf([0, 8, 9]))
