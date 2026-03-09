# -*- coding: utf-8 -*-
"""
@文件: test_serialize.py
@說明:
@時間: 2023/12/01 13:36:58
@作者: LiDong
"""


from marshmallow import Schema, fields, validate


class CreateUpdateProjectSchema(Schema):
    project_nm = fields.Str(required=True)
    describe = fields.Str(required=True)
    expected_end_date = fields.Str()
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="images"))
    videos = fields.List(fields.Raw(type="videos"))
    product_pm = fields.Str()
    project_pm = fields.Str(required=True)
    department = fields.Str(required=True)
    priority = fields.Int(required=True)
    reviewer = fields.List(fields.Str())
    group_id = fields.Int(required=True)
    code_url = fields.Str()
    end_time = fields.Str()


class UploadSchema(Schema):
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="images"))
    videos = fields.List(fields.Raw(type="videos"))
    architecture_diagram = fields.List(fields.Raw(type="architecture_diagram"))
    flowchart = fields.List(fields.Raw(type="flowchart"))
    interface_design_drawing = fields.List(fields.Raw(type="interface_design_drawing"))
    interface_documentation = fields.Raw(type="interface_documentation")
    framework_code = fields.Str()
    datasheet_documentation = fields.Raw(type="datasheet_documentation")


class UploadFunctionFileSchema(Schema):
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="images"))
    videos = fields.List(fields.Raw(type="videos"))


class UpdateFunctionSchema(Schema):
    function_nm = fields.Str()
    describe = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    developers = fields.List(fields.Str())
    priority = fields.Int()
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="file"))
    videos = fields.List(fields.Raw(type="file"))
    group1 = fields.Str(required=True)
    group2 = fields.Str()


class AddFunctionSchema(UpdateFunctionSchema):
    reviewer = fields.List(fields.Str())


class TaskAllocationSchema(Schema):
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    developers = fields.List(fields.Str())


class CreateProgressSchema(Schema):
    progress = fields.Int(required=True)
    progress_record = fields.Str()
    files = fields.List(fields.Raw(type="file"))
    images = fields.List(fields.Raw(type="file"))
    start_time = fields.Str()
    time_consum = fields.Str(required=True)
    cooperator = fields.List(fields.Str())


class OrderBySchema(Schema):
    key = fields.Str()
    value = fields.Int()


class ProjectListSchema(Schema):
    page = fields.Int(required=True)
    size = fields.Int()
    keyword = fields.Str()
    status = fields.Int()
    orderby = fields.List(fields.Nested(OrderBySchema))
    project_pm = fields.Str()
    group_id = fields.Int()


class ProgressDataSchema(Schema):
    page = fields.Int()
    size = fields.Int()
    unread = fields.Int()


class SetStatusSchema(Schema):
    status = fields.Int(required=True, validate=validate.OneOf([0, 5, 7, 8, 9]))


class TaskSetStatusSchema(Schema):
    status = fields.Int(required=True, validate=validate.OneOf([0, 8, 9]))


class ProjectTaskListSchema(Schema):
    page = fields.Int()
    size = fields.Int()
    keyword = fields.Str()
    developers = fields.Str()
    orderby = fields.List(fields.Nested(OrderBySchema))
    status = fields.Int()
    priority = fields.Int()


class ProjectFunctionListSchema(Schema):
    status = fields.List(
        fields.Integer(
            validate=validate.OneOf(
                [1, 2, 3, 4, 8],
                error="status must be  [1/2/3/4/8]",
            )
        ),
        required=True
    )
    page = fields.Int()
    size = fields.Int()


class ResultProjectFunctionSchema(Schema):
    developers = fields.Str()
    status = fields.Int()
    progress = fields.Int()


class ProjectReviewSchema(Schema):
    page = fields.Int()
    size = fields.Int()


class ProjectApprovalSchema(Schema):
    result = fields.Str(required=True)
    reviewer = fields.Str(required=True)
    remark = fields.Str()


class SubmitForReviewSchema(Schema):
    reviewer = fields.List(fields.Str(), required=True)
    status = fields.Int(
        required=True, validate=validate.OneOf([1, 3], error="status must be 1 or 3")
    )
