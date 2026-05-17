# -*- coding: utf-8 -*-
"""用户管理接口 Blueprint"""
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.user_controller import UserController
from serializes.user_serialize import (
    LoginSchema, CreateUserSchema, UpdateUserSchema, HierarchySchema,
)
from serializes.response_serialize import RspMsgDictSchema, RspMsgRawSchema

blp = Blueprint("user_api", __name__, description="用户管理接口")
ctrl = UserController()


# ─── Auth ────────────────────────────────────────────────────────────────────

@blp.route("/login")
class LoginApi(MethodView):
    @blp.arguments(LoginSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """用户登录"""
        result = ctrl.login(
            work_no=payload["work_no"],
            password=payload["password"],
            location=payload.get("location", ""),
        )
        return response_result(content=result)


@blp.route("/index")
class IndexApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取用户首页数据"""
        work_no = get_identity()
        return response_result(content=ctrl.get_index_data(work_no))


@blp.route("/statistical")
class StatisticalApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取用户统计数据"""
        work_no = get_identity()
        return response_result(content=ctrl.get_statistical(work_no))


@blp.route("/team_statistical")
class TeamStatisticalApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取团队统计数据（主管视角）"""
        work_no = get_identity()
        return response_result(content=ctrl.get_team_statistical(work_no))


@blp.route("/weekly_activity")
class WeeklyActivityApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取本周活动概览（每天进度更新条数）"""
        work_no = get_identity()
        return response_result(content=ctrl.get_weekly_activity(work_no))


@blp.route("/alert_tasks")
class AlertTasksApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取待关注任务（7天内到期或已超期）"""
        work_no = get_identity()
        return response_result(content=ctrl.get_alert_tasks(work_no))


@blp.route("/latest_news")
class LatestNewsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取最新动态"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 10))
        return response_result(content=ctrl.get_latest_news(work_no, page=page, size=size))


# ─── User MGMT ───────────────────────────────────────────────────────────────

@blp.route("/mgmt/users")
class UserListApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """获取用户列表"""
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        keyword = request.args.get("keyword", "")
        department = request.args.get("department", "")
        return response_result(content=ctrl.list_users(page=page, size=size, keyword=keyword, department=department))


@blp.route("/mgmt/user")
class UserCreateApi(MethodView):
    @jwt_required()
    @blp.arguments(CreateUserSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """创建用户"""
        return response_result(content=ctrl.create_user(payload))


@blp.route("/mgmt/user/<string:work_no>")
class UserDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, work_no):
        """获取用户详情"""
        return response_result(content=ctrl.get_user(work_no))

    @jwt_required()
    @blp.arguments(UpdateUserSchema)
    @blp.response(200, RspMsgDictSchema)
    def put(self, payload, work_no):
        """更新用户"""
        ctrl.update_user(work_no, payload)
        return response_result()

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, work_no):
        """删除用户"""
        ctrl.delete_user(work_no)
        return response_result()


@blp.route("/mgmt/departments")
class DepartmentsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取部门列表（部门表 + 用户记录合并）"""
        return response_result(content=ctrl.get_departments())

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def post(self):
        """新建部门"""
        data = request.get_json(silent=True) or {}
        name = data.get("name", "").strip()
        result = ctrl.create_department(name)
        return response_result(content=result)


@blp.route("/mgmt/departments/<string:dept_id>")
class DepartmentDetailApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, dept_id):
        """删除部门（仅限手动创建的）"""
        ctrl.delete_department(dept_id)
        return response_result(content={})


# ─── Hierarchy ───────────────────────────────────────────────────────────────

@blp.route("/mgmt/hierarchy")
class HierarchyApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self):
        """获取所有上下级关系"""
        return response_result(content=ctrl.get_all_relations())

    @jwt_required()
    @blp.arguments(HierarchySchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        """设置上下级关系"""
        return response_result(content=ctrl.set_relation(
            payload["supervisor_work_no"],
            payload["subordinate_work_no"],
        ))


@blp.route("/mgmt/hierarchy/<string:relation_id>")
class HierarchyDeleteApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def delete(self, relation_id):
        """删除上下级关系"""
        ctrl.remove_relation(relation_id)
        return response_result()


@blp.route("/mgmt/<string:work_no>/subordinates")
class SubordinatesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self, work_no):
        """获取下属列表"""
        all_levels = request.args.get("all_levels", "false").lower() == "true"
        return response_result(content=ctrl.get_subordinates(work_no, all_levels=all_levels))


@blp.route("/mgmt/<string:work_no>/supervisors")
class SupervisorsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgRawSchema)
    def get(self, work_no):
        """获取上级列表"""
        return response_result(content=ctrl.get_supervisors(work_no))


@blp.route("/mgmt/<string:work_no>/team")
class TeamTreeApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, work_no):
        """获取团队树"""
        return response_result(content=ctrl.get_team_tree(work_no))


# ─── Personal Queries ────────────────────────────────────────────────────────

@blp.route("/project")
class MyProjectsApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """我的项目列表"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        status = request.args.get("status")
        return response_result(content=ctrl.my_projects(
            work_no, page=page, size=size, status=int(status) if status else None
        ))


@blp.route("/temporary_duty")
class MyDutiesApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """我的临时任务列表"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        status = request.args.get("status")
        return response_result(content=ctrl.my_duties(
            work_no, page=page, size=size, status=int(status) if status else None
        ))


@blp.route("/project/my_apply")
class MyProjectApplyApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """我的项目申请"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.my_project_apply(work_no, page=page, size=size))


@blp.route("/temporary_duty/my_apply")
class MyDutyApplyApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """我的任务申请"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.my_duty_apply(work_no, page=page, size=size))


@blp.route("/project/apply/<string:apply_id>")
class CancelProjectApplyApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, apply_id):
        """撤回项目申请"""
        work_no = get_identity()
        ctrl.cancel_apply(apply_id, work_no)
        return response_result()


@blp.route("/temporary_duty/apply/<string:apply_id>")
class CancelDutyApplyApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def put(self, apply_id):
        """撤回任务申请"""
        work_no = get_identity()
        ctrl.cancel_apply(apply_id, work_no)
        return response_result()


@blp.route("/project/audit_record")
class ProjectAuditRecordApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """项目审核记录"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.project_audit_record(work_no, page=page, size=size))


@blp.route("/duty/audit_record")
class DutyAuditRecordApi(MethodView):
    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self):
        """任务审核记录"""
        work_no = get_identity()
        page = int(request.args.get("page", 1))
        size = int(request.args.get("size", 20))
        return response_result(content=ctrl.duty_audit_record(work_no, page=page, size=size))
