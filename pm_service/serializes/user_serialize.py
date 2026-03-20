# -*- coding: utf-8 -*-
"""用户模块序列化"""
from marshmallow import Schema, fields, validate


class LoginSchema(Schema):
    work_no = fields.Str(required=True, metadata={"description": "工号"})
    password = fields.Str(required=True, metadata={"description": "密码"})
    location = fields.Str(load_default="", metadata={"description": "登录地点"})


class CreateUserSchema(Schema):
    work_no = fields.Str(required=True)
    name = fields.Str(required=True)
    department = fields.Str(load_default="")
    position = fields.Str(load_default="")
    email = fields.Str(load_default="")
    phone = fields.Str(load_default="")
    password = fields.Str(load_default="")
    location = fields.Str(load_default="")


class UpdateUserSchema(Schema):
    name = fields.Str()
    department = fields.Str()
    position = fields.Str()
    email = fields.Str()
    phone = fields.Str()
    password = fields.Str()
    location = fields.Str()


class QueryUsersSchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
    keyword = fields.Str(load_default="")
    department = fields.Str(load_default="")


class HierarchySchema(Schema):
    supervisor_work_no = fields.Str(required=True)
    subordinate_work_no = fields.Str(required=True)


class SubordinateQuerySchema(Schema):
    all_levels = fields.Bool(load_default=False)


class AssignRoleSchema(Schema):
    role_code = fields.Str(required=True)


class PageSchema(Schema):
    page = fields.Int(load_default=1)
    size = fields.Int(load_default=20)
