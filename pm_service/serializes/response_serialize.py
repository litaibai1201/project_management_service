# -*- coding: utf-8 -*-
"""
@文件: response_serialize.py
@說明:
@時間: 2024/05/23 19:26:10
"""


from marshmallow import Schema, fields


class RspBaseSchema(Schema):
    code = fields.Str(required=True)
    msg = fields.Str(required=True)


class RspMsgDictSchema(RspBaseSchema):
    content = fields.Dict()


class RspMsgListSchema(RspBaseSchema):
    content = fields.List(fields.Dict())


class RspMsgSchema(RspBaseSchema):
    content = fields.Str()
