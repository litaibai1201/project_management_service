# -*- coding: utf-8 -*-
"""系统管理接口 Blueprint"""
from flask.views import MethodView
from flask_smorest import Blueprint
from flask_jwt_extended import get_jwt
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from utils.exceptions import PermissionException
from controllers.system_controller import SystemController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema
from serializes.system_serialize import (
    SystemListQuerySchema, CreateSystemSchema, UpdateSystemSchema,
)
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import UserRoleModel

blp = Blueprint("system_api", __name__, description="系统管理接口")
ctrl = SystemController()


def _require_admin():
    """检查当前用户是否为管理员，否则抛出权限异常"""
    claims = get_jwt()
    # 系统管理员（AdminUserModel）的 JWT claims 中 role_code = "system_admin"
    if claims.get("role_code") == "system_admin":
        return
    work_no = get_identity()
    ur = db.session.query(UserRoleModel).filter_by(work_no=work_no).first()
    if not ur or ur.role_code != "admin":
        raise PermissionException(msg="仅管理员可执行此操作")


@blp.route("/report_stats")
class SystemReportStatsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """系统需求与任务统计报表"""
        return response_result(content=ctrl.get_report_stats())


@blp.route("/list")
class SystemListApi(MethodView):
    @jwt_required()
    @blp.arguments(SystemListQuerySchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """系统列表（所有人可查）"""
        return response_result(content=ctrl.list_systems(payload))


@blp.route("/groups")
class SystemGroupsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取所有系统分组"""
        return response_result(content=ctrl.list_groups())


@blp.route("/create")
class SystemCreateApi(MethodView):
    @jwt_required()
    @blp.arguments(CreateSystemSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """创建系统（仅管理员）"""
        _require_admin()
        result = ctrl.create_system(payload)
        from controllers.system_admin_controller import _log_operation
        _log_operation(get_identity(), "新增系统", detail=f"系统: {payload.get('sys_nm', '')}", target_table="system_form", target_id=result.get("id", ""))
        return response_result(content=result)


@blp.route("/<string:system_id>")
class SystemDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, system_id):
        """获取系统详情（所有人可查）"""
        return response_result(content=ctrl.get_system(system_id))

    @jwt_required()
    @blp.arguments(UpdateSystemSchema)
    @blp.response(200, RspMsgDictSchema)
    def put(self, payload, system_id):
        """更新系统（仅管理员）"""
        _require_admin()
        result = ctrl.update_system(system_id, payload)
        from controllers.system_admin_controller import _log_operation
        _log_operation(get_identity(), "更新系统", detail=f"系统ID: {system_id}", target_table="system_form", target_id=system_id)
        return response_result(content=result)

    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def delete(self, system_id):
        """删除系统（仅管理员）"""
        _require_admin()
        result = ctrl.delete_system(system_id)
        from controllers.system_admin_controller import _log_operation
        _log_operation(get_identity(), "删除系统", detail=f"系统ID: {system_id}", target_table="system_form", target_id=system_id)
        return response_result(content=result)
