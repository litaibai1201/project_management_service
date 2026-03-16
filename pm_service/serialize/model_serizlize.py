# -*- coding: utf-8 -*-
"""
@文件: all_db.py
@說明: 模型類
@時間: 2023/10/26 16:54:19
@作者: LiDong
"""
from marshmallow import post_load

from dbs.mysql_db import CommonModelDbSchema
from dbs.mysql_db.model_tables import (
    FunctionDataModel,
    OperRecordModel,
    PermissionModel,
    ProgressRecordDataModel,
    ProjectApplyRecordModel,
    ProjectDataModel,
    ProjectGroupModel,
    ReviewRecordModel,
    RoleModel,
    TemporaryDutyApplyRecordModel,
    TemporaryDutyModel,
    TemporaryDutyRecordDataModel,
    UserPermissionRelationalModel,
    UserRoleModel,
)


class ProjectDataModelSchema(CommonModelDbSchema):

    __modelclass__ = ProjectDataModel

    @post_load
    def post_load(self, instance, **kwargs):
        return ProjectDataModel(**instance)


class FunctionDataModelSchema(CommonModelDbSchema):

    __modelclass__ = FunctionDataModel

    @post_load
    def post_load(self, instance, **kwargs):
        return FunctionDataModel(**instance)


class ProgressRecordDataModelSchema(CommonModelDbSchema):

    __modelclass__ = ProgressRecordDataModel

    @post_load
    def post_load(self, instance, **kwargs):
        return ProgressRecordDataModel(**instance)


class ProjectApplyRecordModelSchema(CommonModelDbSchema):

    __modelclass__ = ProjectApplyRecordModel

    @post_load
    def post_load(self, instance, **kwargs):
        return ProjectApplyRecordModel(**instance)


class TemporaryDutyModelSchema(CommonModelDbSchema):

    __modelclass__ = TemporaryDutyModel

    @post_load
    def post_load(self, instance, **kwargs):
        return TemporaryDutyModel(**instance)


class TemporaryDutyRecordDataModelSchema(CommonModelDbSchema):

    __modelclass__ = TemporaryDutyRecordDataModel

    @post_load
    def post_load(self, instance, **kwargs):
        return TemporaryDutyRecordDataModel(**instance)


class TemporaryDutyApplyRecordModelSchema(CommonModelDbSchema):

    __modelclass__ = TemporaryDutyApplyRecordModel

    @post_load
    def post_load(self, instance, **kwargs):
        return TemporaryDutyApplyRecordModel(**instance)


class PermissionModelSchema(CommonModelDbSchema):

    __modelclass__ = PermissionModel

    @post_load
    def post_load(self, instance, **kwargs):
        return PermissionModel(**instance)


class UserPermissionRelationalModelSchema(CommonModelDbSchema):

    __modelclass__ = UserPermissionRelationalModel

    @post_load
    def post_load(self, instance, **kwargs):
        return UserPermissionRelationalModel(**instance)


class RoleModelSchema(CommonModelDbSchema):

    __modelclass__ = RoleModel

    @post_load
    def post_load(self, instance, **kwargs):
        return RoleModel(**instance)


class UserRoleModelSchema(CommonModelDbSchema):

    __modelclass__ = UserRoleModel

    @post_load
    def post_load(self, instance, **kwargs):
        return UserRoleModel(**instance)


class OperRecordModelSchema(CommonModelDbSchema):

    __modelclass__ = OperRecordModel

    @post_load
    def post_load(self, instance, **kwargs):
        return OperRecordModel(**instance)


class ReviewRecordModelSchema(CommonModelDbSchema):

    __modelclass__ = ReviewRecordModel

    @post_load
    def post_load(self, instance, **kwargs):
        return ReviewRecordModel(**instance)


class ProjectGroupModelSchema(CommonModelDbSchema):

    __modelclass__ = ProjectGroupModel

    @post_load
    def post_load(self, instance, **kwargs):
        return ProjectGroupModel(**instance)
