# -*- coding: utf-8 -*-
"""
@文件: serializes.py
@說明:
@時間: 2024/03/06 16:01:01
@作者: LiDong
"""


from marshmallow import Schema, fields, validate


class MemberApiSchema(Schema):
    page = fields.Int()
    size = fields.Int()
    start_date = fields.Str()
    end_date = fields.Str()
    time_type = fields.Int()


class MemberProduceReportApiSchema(Schema):
    start_date = fields.Str()
    end_date = fields.Str()


class FunctionDataSchema(Schema):
    function_id = fields.String(required=True)
    function_nm = fields.String(required=True)
    function_progress = fields.String(required=True)
    time_consum = fields.Float(required=True)
    progress_record = fields.String(required=True)
    _paths = fields.List(fields.String())


class ProjectDataSchema(Schema):
    project_id = fields.String(required=True)
    project_nm = fields.String(required=True)
    total_time_consum = fields.Float(required=True)
    function_list = fields.List(
        fields.Nested(FunctionDataSchema), required=True
    )


class SendReportApiSchema(Schema):
    start_date = fields.Str(required=True)
    end_date = fields.Str(required=True)
    dep_nm = fields.Str(required=True)
    username = fields.Str(required=True)
    content = fields.List(fields.Nested(ProjectDataSchema), required=True)


class OrderBySchema(Schema):
    key = fields.Str()
    value = fields.Int()


class OverviewApiSchema(Schema):
    page = fields.Int()
    size = fields.Int()
    start_date = fields.Str()
    end_date = fields.Str()
    project_id = fields.Str()
    status = fields.Int()
    priority = fields.Int()
    orderby = fields.List(fields.Nested(OrderBySchema))


class StatisticalDataApiSchema(Schema):
    start_date = fields.Str()
    end_date = fields.Str()
    project_id = fields.Str()
    priority = fields.Int()


class ScheduleDataSchema(Schema):
    project_id = fields.String()
    project_nm = fields.String()
    function_id = fields.String()
    function_nm = fields.String()
    expected_start_date = fields.String()
    expected_end_date = fields.String()
    latest_expected_end_date = fields.String()
    status = fields.Integer()
    priority = fields.Integer()
