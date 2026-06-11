# -*- coding: utf-8 -*-
"""系统管理序列化"""
from marshmallow import fields
from serializes.base_schema import BaseSchema


class SystemListQuerySchema(BaseSchema):
    keyword = fields.Str(load_default="")
    sys_group = fields.Str(load_default="")
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=50)


class CreateSystemSchema(BaseSchema):
    sys_nm = fields.Str(required=True)
    sys_code = fields.Str(load_default="")
    sys_group = fields.Str(load_default="")
    describe = fields.Str(load_default="")
    maintainers = fields.List(fields.Str(), load_default=[])


class UpdateSystemSchema(BaseSchema):
    sys_nm = fields.Str()
    sys_code = fields.Str()
    sys_group = fields.Str()
    describe = fields.Str()
    maintainers = fields.List(fields.Str())
