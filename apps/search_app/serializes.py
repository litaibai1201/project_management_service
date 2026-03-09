# -*- coding: utf-8 -*-
"""
@文件: serializes.py
@說明:
@時間: 2024/03/06 16:01:01
@作者: LiDong
"""


from marshmallow import Schema, fields, validate


class SearchApiSchema(Schema):
    page = fields.Int(required=True)
    size = fields.Int(required=True)
    keyword = fields.Str(
        required=True,
        validate=validate.Length(min=1, error="keyword can not empty"),
    )
    department = fields.Str()
    is_finished = fields.Str(
        validate=validate.OneOf(
            ["Y", "N"], error="is_finished must be Y or N"
        )
    )
    start_date = fields.Str()
    end_date = fields.Str()
    type = fields.Str(
        required=True,
        validate=validate.OneOf(
            ["專案", "臨時任務"], error="type must be 專案 or 臨時任務"
        )
    )


class PathsSchema(Schema):
    _paths = fields.List(fields.Str(required=True))
