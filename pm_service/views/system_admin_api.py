# -*- coding: utf-8 -*-
"""系统管理员接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from flask_jwt_extended import get_jwt
from utils.auth import jwt_required
from utils.response import response_result
from utils.exceptions import PermissionException, ValidationException
from controllers.system_admin_controller import SystemAdminController
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema

blp  = Blueprint("system_admin_api", __name__, description="系统管理员接口")
ctrl = SystemAdminController()


def _require_system_admin():
    claims = get_jwt()
    if not claims.get("is_admin"):
        raise PermissionException(msg="仅系统管理员可执行此操作")


# ── 仪表盘 ────────────────────────────────────────────────────────────────────

@blp.route("/dashboard")
class AdminDashboardApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """管理员仪表盘总览"""
        _require_system_admin()
        return response_result(content=ctrl.get_dashboard())


# ── 用户管理 ──────────────────────────────────────────────────────────────────

@blp.route("/users")
class AdminUserListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取所有用户列表（含禁用用户）"""
        _require_system_admin()
        page       = int(request.args.get("page", 1))
        size       = int(request.args.get("size", 20))
        keyword    = request.args.get("keyword", "")
        department = request.args.get("department", "")
        status_str = request.args.get("status")
        status     = int(status_str) if status_str is not None else None
        return response_result(content=ctrl.list_users(
            page=page, size=size, keyword=keyword, department=department, status=status,
        ))


@blp.route("/users/<string:work_no>/status")
class AdminUserStatusApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, work_no):
        """启用/禁用用户"""
        _require_system_admin()
        payload = request.get_json() or {}
        ctrl.set_user_status(work_no, int(payload.get("status", 1)))
        return response_result()


@blp.route("/users/<string:work_no>/reset_password")
class AdminUserResetPasswordApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, work_no):
        """重置用户密码"""
        _require_system_admin()
        payload      = request.get_json() or {}
        new_password = payload.get("new_password", "")
        if not new_password:
            raise ValidationException(msg="新密码不能为空")
        ctrl.reset_password(work_no, new_password)
        return response_result()


# ── 角色管理 ──────────────────────────────────────────────────────────────────

@blp.route("/roles")
class AdminRoleListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取所有角色"""
        _require_system_admin()
        return response_result(content=ctrl.list_roles())


@blp.route("/users/<string:work_no>/role")
class AdminUserRoleApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, work_no):
        """获取用户角色及下属"""
        _require_system_admin()
        return response_result(content=ctrl.get_user_role_detail(work_no))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, work_no):
        """设置/清除用户角色 (role_code=null 则清除)"""
        _require_system_admin()
        payload   = request.get_json() or {}
        role_code = payload.get("role_code")  # None means clear
        ctrl.set_user_role(work_no, role_code)
        return response_result()


@blp.route("/users/<string:work_no>/subordinates")
class AdminUserSubordinatesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, work_no):
        """替换用户下属列表"""
        _require_system_admin()
        payload    = request.get_json() or {}
        subs       = payload.get("subordinates", [])
        if not isinstance(subs, list):
            raise ValidationException(msg="subordinates 必须为列表")
        ctrl.set_user_subordinates(work_no, subs)
        return response_result()


# ── 系统配置 ──────────────────────────────────────────────────────────────────

@blp.route("/system_config")
class SystemConfigApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取系统配置列表"""
        _require_system_admin()
        return response_result(content=ctrl.get_configs())

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self):
        """批量更新系统配置"""
        _require_system_admin()
        payload = request.get_json() or {}
        ctrl.batch_update_configs(payload)
        return response_result()


# ── 操作日志 ──────────────────────────────────────────────────────────────────

@blp.route("/operation_logs")
class OperationLogsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取操作日志"""
        _require_system_admin()
        page       = int(request.args.get("page", 1))
        size       = int(request.args.get("size", 20))
        work_no    = request.args.get("work_no", "")
        operation  = request.args.get("operation", "")
        start_date = request.args.get("start_date", "")
        end_date   = request.args.get("end_date", "")
        return response_result(content=ctrl.list_logs(
            page=page, size=size, work_no=work_no, operation=operation,
            start_date=start_date, end_date=end_date,
        ))


# ── 管理员账号管理 ────────────────────────────────────────────────────────────

@blp.route("/admins")
class AdminAccountListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取管理员列表"""
        _require_system_admin()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.list_admins(page=page, size=size))

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """新增管理员"""
        _require_system_admin()
        payload  = request.get_json() or {}
        username = payload.get("username", "").strip()
        password = payload.get("password", "").strip()
        name     = payload.get("name", "").strip()
        if not all([username, password, name]):
            raise ValidationException(msg="账号、密码、显示名均不能为空")
        return response_result(content=ctrl.create_admin(username, password, name))


@blp.route("/admins/<string:admin_id>")
class AdminAccountDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, admin_id):
        """删除管理员"""
        _require_system_admin()
        ctrl.delete_admin(admin_id)
        return response_result()
