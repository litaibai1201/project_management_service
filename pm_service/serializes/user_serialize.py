# -*- coding: utf-8 -*-
"""用户模块序列化"""
from marshmallow import fields, validate
from serializes.base_schema import BaseSchema


class LoginSchema(BaseSchema):
    work_no = fields.Str(required=True, metadata={"description": "工号"})
    password = fields.Str(required=True, metadata={"description": "密码"})
    location = fields.Str(load_default="", metadata={"description": "登录地点"})


class SSOLoginSchema(BaseSchema):
    """idaas登录请求 Schema"""

    id_token = fields.Str(
        required=True, metadata={"description": "idaas传来的id_token"}
    )
    target_url = fields.Str(
        required=False, metadata={"description": "idaas平台的前端回调地址（不含路径）"}
    )


class CreateUserSchema(BaseSchema):
    work_no = fields.Str(required=True)
    name = fields.Str(required=True)
    department = fields.Str(load_default="")
    position = fields.Str(load_default="")
    email = fields.Str(load_default="")
    phone = fields.Str(load_default="")
    password = fields.Str(load_default="")
    location = fields.Str(load_default="")


class UpdateUserSchema(BaseSchema):
    name = fields.Str()
    department = fields.Str()
    position = fields.Str()
    email = fields.Str()
    phone = fields.Str()
    password = fields.Str()
    location = fields.Str()


class QueryUsersSchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    department = fields.Str(load_default="")


class HierarchySchema(BaseSchema):
    supervisor_work_no = fields.Str(required=True)
    subordinate_work_no = fields.Str(required=True)


class SubordinateQuerySchema(BaseSchema):
    all_levels = fields.Bool(load_default=False)


class AssignRoleSchema(BaseSchema):
    role_code = fields.Str(required=True)


class PageSchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)


class LatestNewsQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=10)


class MyProjectsQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    status = fields.Int(load_default=None, allow_none=True)


class MyDutiesQuerySchema(BaseSchema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    status = fields.Int(load_default=None, allow_none=True)
