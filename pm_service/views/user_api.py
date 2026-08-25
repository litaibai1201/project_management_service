# -*- coding: utf-8 -*-
"""用户管理接口 Blueprint"""
import os
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from utils.auth import jwt_required, get_identity
from utils.response import response_result
from controllers.user_controller import UserController
from serializes.user_serialize import (
    LoginSchema, CreateUserSchema, SSOLoginSchema, UpdateUserSchema, HierarchySchema,
    QueryUsersSchema, SubordinateQuerySchema, PageSchema,
    LatestNewsQuerySchema, MyProjectsQuerySchema, MyDutiesQuerySchema,
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

@blp.route("/sso/login")
class SsoLoginApi(MethodView):

    @blp.arguments(SSOLoginSchema, location="query")
    def get(self, payload):
        """IDaaS JWT SSO 登录 — 验证成功后重定向到前端回调页"""
        from flask import redirect
        from urllib.parse import urlencode
        import json as _json

        target_url = payload.get("target_url", "")
        from urllib.parse import urlparse
        if target_url:
            parsed = urlparse(target_url)
            frontend_origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
        else:
            frontend_origin = ""
        if not frontend_origin:
            frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

        try:
            result = ctrl.sso_login(payload)
            params = urlencode({
                "token": result["access_token"],
                "user": _json.dumps({
                    "work_no": result["work_no"],
                    "name": result["name"],
                    "department": result.get("department", ""),
                    "role_code": result.get("role_code") or "",
                    "role_name": result.get("role_name") or "",
                    "is_admin": result.get("is_admin", False),
                    "is_supervisor": result.get("is_supervisor", False),
                }, ensure_ascii=False),
                "target_url": target_url or "/",
            })
            return redirect(f"{frontend_origin}/sso/callback?{params}")
        except Exception as e:
            params = urlencode({"error": str(e), "target_url": target_url or "/"})
            return redirect(f"{frontend_origin}/sso/callback?{params}")


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
    @blp.arguments(LatestNewsQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """获取最新动态"""
        work_no = get_identity()
        return response_result(content=ctrl.get_latest_news(
            work_no, page=query_params["page"], size=query_params["size"],
        ))


# ─── User MGMT ───────────────────────────────────────────────────────────────

@blp.route("/mgmt/users")
class UserListApi(MethodView):
    @jwt_required()
    @blp.arguments(QueryUsersSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """获取用户列表"""
        return response_result(content=ctrl.list_users(
            page=query_params["page"],
            size=query_params["size"],
            keyword=query_params["keyword"],
            department=query_params["department"],
        ))


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
    @blp.arguments(SubordinateQuerySchema, location="query")
    @blp.response(200, RspMsgRawSchema)
    def get(self, query_params, work_no):
        """获取下属列表"""
        return response_result(content=ctrl.get_subordinates(work_no, all_levels=query_params["all_levels"]))


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
    @blp.arguments(MyProjectsQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """我的项目列表"""
        work_no = get_identity()
        return response_result(content=ctrl.my_projects(
            work_no,
            page=query_params["page"],
            size=query_params["size"],
            status=query_params["status"],
        ))


@blp.route("/temporary_duty")
class MyDutiesApi(MethodView):
    @jwt_required()
    @blp.arguments(MyDutiesQuerySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """我的AR列表"""
        work_no = get_identity()
        return response_result(content=ctrl.my_duties(
            work_no,
            page=query_params["page"],
            size=query_params["size"],
            status=query_params["status"],
        ))


@blp.route("/project/my_apply")
class MyProjectApplyApi(MethodView):
    @jwt_required()
    @blp.arguments(PageSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """我的项目申请"""
        work_no = get_identity()
        return response_result(content=ctrl.my_project_apply(
            work_no, page=query_params["page"], size=query_params["size"],
        ))


@blp.route("/temporary_duty/my_apply")
class MyDutyApplyApi(MethodView):
    @jwt_required()
    @blp.arguments(PageSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """我的任务申请"""
        work_no = get_identity()
        return response_result(content=ctrl.my_duty_apply(
            work_no, page=query_params["page"], size=query_params["size"],
        ))


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
    @blp.arguments(PageSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """项目审核记录"""
        work_no = get_identity()
        return response_result(content=ctrl.project_audit_record(
            work_no, page=query_params["page"], size=query_params["size"],
        ))


@blp.route("/duty/audit_record")
class DutyAuditRecordApi(MethodView):
    @jwt_required()
    @blp.arguments(PageSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, query_params):
        """任务审核记录"""
        work_no = get_identity()
        return response_result(content=ctrl.duty_audit_record(
            work_no, page=query_params["page"], size=query_params["size"],
        ))
