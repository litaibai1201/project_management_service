# -*- coding: utf-8 -*-
"""
@文件: views.py
@說明:
@時間: 2024/03/06 15:59:34
@作者: LiDong
"""

from flask import request
from flask.views import MethodView
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_smorest import Blueprint

from apps.user_app.controllers.audit_record_duty import \
    DutyAuditRecordController
from apps.user_app.controllers.audit_record_project import \
    ProjectAuditRecordController
from apps.user_app.controllers.hierarchy_ctr import HierarchyController
from apps.user_app.controllers.index_ctr import UserIndexController
from apps.user_app.controllers.latest_news_ctr import UserLatestNewsController
from apps.user_app.controllers.login_ctr import LogInController
from apps.user_app.controllers.my_apply_duty_cancel_ctr import \
    DutyMyApplyCancelController
from apps.user_app.controllers.my_apply_duty_ctr import DutyMyApplyController
from apps.user_app.controllers.my_apply_project_cancel_ctr import \
    ProjectMyApplyCancelController
from apps.user_app.controllers.my_apply_project_ctr import \
    ProjectMyApplyController
from apps.user_app.controllers.project_ctr import UserProjectController
from apps.user_app.controllers.statistical_ctr import UserStatisticalController
from apps.user_app.controllers.temp_duty_ctr import UserTempDutyController
from apps.user_app.controllers.role_mgmt_ctr import (RoleMgmtController,
                                                       UserRoleMgmtController)
from apps.user_app.controllers.user_mgmt_ctr import UserMgmtController
from apps.user_app.serializes import (AssignRoleSchema, AuditRecordSchema,
                                      CreateHierarchySchema,
                                      CreateRoleSchema, CreateUserMgmtSchema,
                                      LogInSchema, MyApplySchema,
                                      QuerySubordinatesSchema,
                                      QueryUsersMgmtSchema,
                                      RspLogInLogOutSchema,
                                      RspRoleSchema, RspRolesSchema,
                                      RspUserLstestNewsSchema,
                                      RspUserMgmtSchema, RspUserPageSchema,
                                      RspUserRoleSchema, RspUsersMgmtSchema,
                                      RspUserStatisticalSchema,
                                      UpdateRoleSchema, UpdateUserMgmtSchema,
                                      UserLstestNewsSchema, UserProjectSchema,
                                      UserTempDutySchema)
from common.common_method import fail_response_result, response_data_result
from common.oper_log import add_operation_record
from serialize.response_serialize import (RspMsgDictSchema, RspMsgListSchema,
                                          RspMsgSchema)

blp = Blueprint("user", __name__, url_prefix="/api/user")


@blp.route("/login")
class LoginApi(MethodView):
    """
    此類用來定義/login及請求方式
    """

    @blp.arguments(LogInSchema)
    @blp.response(200, RspLogInLogOutSchema)
    def post(self, payload):
        lic = LogInController(payload)
        # result_ad = lic.log_in_ad()
        # if not result_ad:
        #     return fail_response_result(msg="AD請求失敗")
        # elif result_ad["code"] != "S10000":
        #     return fail_response_result(msg="工號或密碼或園區錯誤")
        token_payload = lic.get_token_payload()
        add_operation_record(
            operator=payload["work_no"],
            action="login",
            status="success",
            matter="登錄系統",
            ip=request.headers.get("X-Real-IP", ""),
        )
        return response_data_result(content=token_payload)


@blp.route("/index")
class IndexApi(MethodView):
    """
    此類用來定義/index及請求方式
    """

    def __init__(self) -> None:
        super().__init__()
        self.UIC = UserIndexController()

    @jwt_required()
    @blp.response(200, RspUserPageSchema)
    def get(self):
        empid = get_jwt_identity()["empid"]
        data = self.UIC.query_user_data(empid)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/project")
class ProjectApi(MethodView):
    """
    獲取個人主頁中的專案清單內容
    """

    def __init__(self) -> None:
        super().__init__()
        self.UPC = UserProjectController()

    @jwt_required()
    @blp.arguments(UserProjectSchema, location="query")
    @blp.response(200, RspMsgListSchema)
    def get(self, payload):
        empid = get_jwt_identity()["empid"]
        data = self.UPC.query_user_project_data(empid, payload)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/temporary_duty")
class TemporaryDutyApi(MethodView):
    """
    獲取個人主頁中的臨時任務內容
    """

    def __init__(self) -> None:
        super().__init__()
        self.UTDC = UserTempDutyController()

    @jwt_required()
    @blp.arguments(UserTempDutySchema, location="query")
    @blp.response(200, RspMsgListSchema)
    def get(self, payload):
        empid = get_jwt_identity()["empid"]
        data = self.UTDC.query_user_temp_duty_data(empid, payload)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/latest_news")
class LatestNewsApi(MethodView):
    """
    獲取個人主頁中的最新動態
    """

    def __init__(self) -> None:
        super().__init__()
        self.ULNC = UserLatestNewsController()

    @jwt_required()
    @blp.arguments(UserLstestNewsSchema, location="query")
    @blp.response(200, RspUserLstestNewsSchema)
    def get(self, payload):
        data = self.ULNC.query_user_latest_news_data(payload)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/statistical")
class StatisticalApi(MethodView):
    """
    獲取個人主頁中的個人任務概覽
    """

    def __init__(self) -> None:
        super().__init__()
        self.USC = UserStatisticalController()

    @jwt_required()
    @blp.response(200, RspUserStatisticalSchema)
    def get(self):
        empid = get_jwt_identity()["empid"]
        data = self.USC.query_user_statistical(empid)
        return response_data_result(content=data, msg="查詢成功")


@blp.route("/project/my_apply")
class ProjectMyApplyApi(MethodView):
    """
    此類用來定義/project/my_apply
    """

    @jwt_required()
    @blp.arguments(MyApplySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        pmac = ProjectMyApplyController(payload, user_id)
        req = pmac.get_my_apply_project()
        return response_data_result(content=req)


@blp.route("/temporary_duty/my_apply")
class DutyMyApplyApi(MethodView):
    """
    此類用來定義/temporary_duty/my_apply
    """

    @jwt_required()
    @blp.arguments(MyApplySchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        dmac = DutyMyApplyController(payload, user_id)
        req = dmac.get_my_apply_duty()
        return response_data_result(content=req)


@blp.route("/project/apply/<string:apply_id>")
class ProjectMyApplyCancelApi(MethodView):
    """
    此類用來定義/project/<apply_id>/cancel
    """

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def put(self, apply_id):
        pmacc = ProjectMyApplyCancelController(apply_id)
        result, flag = pmacc.my_apply_cancel()
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result()


@blp.route("/temporary_duty/apply/<string:apply_id>")
class DutyMyApplyCancelApi(MethodView):
    """
    此類用來定義/temporary_duty/<apply_id>/cancel
    """

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def put(self, apply_id):
        dmacc = DutyMyApplyCancelController(apply_id)
        result, flag = dmacc.my_apply_cancel()
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result()


@blp.route("/project/audit_record")
class ProjectAuditRecordApi(MethodView):
    """
    此類用來定義/project/audit_record
    """

    @jwt_required()
    @blp.arguments(AuditRecordSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        parc = ProjectAuditRecordController(user_id, payload)
        req = parc.audit_record_project()
        return response_data_result(content=req)


@blp.route("/duty/audit_record")
class DutyAuditRecordApi(MethodView):
    """
    此類用來定義/duty/audit_record
    """

    @jwt_required()
    @blp.arguments(AuditRecordSchema, location="query")
    @blp.response(200, RspMsgDictSchema)
    def get(self, payload):
        user_id = get_jwt_identity()["empid"]
        darc = DutyAuditRecordController(user_id, payload)
        req = darc.audit_record_duty()
        return response_data_result(content=req)


# ──────────────────────────────────────────────────────────────
#  用戶管理 API（前綴 /api/user/mgmt）
# ──────────────────────────────────────────────────────────────

@blp.route("/mgmt/user")
class UserMgmtApi(MethodView):
    """新增用戶"""

    @jwt_required()
    @blp.arguments(CreateUserMgmtSchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        umc = UserMgmtController()
        result, flag = umc.create_user(payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result, msg="新增用戶成功")


@blp.route("/mgmt/users")
class UsersMgmtApi(MethodView):
    """查詢用戶列表（分頁 + 搜尋 + 部門過濾）"""

    @jwt_required()
    @blp.arguments(QueryUsersMgmtSchema, location="query")
    @blp.response(200, RspUsersMgmtSchema)
    def get(self, payload):
        umc = UserMgmtController()
        result = umc.get_users(payload)
        return response_data_result(content=result, msg="查詢成功")


@blp.route("/mgmt/user/<string:work_no>")
class UserMgmtDetailApi(MethodView):
    """查詢 / 更新 / 刪除單個用戶"""

    @jwt_required()
    @blp.response(200, RspUserMgmtSchema)
    def get(self, work_no):
        umc = UserMgmtController()
        result, flag = umc.get_user(work_no)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result, msg="查詢成功")

    @jwt_required()
    @blp.arguments(UpdateUserMgmtSchema)
    @blp.response(200, RspMsgSchema)
    def put(self, payload, work_no):
        umc = UserMgmtController()
        result, flag = umc.update_user(work_no, payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def delete(self, work_no):
        umc = UserMgmtController()
        result, flag = umc.delete_user(work_no)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)


@blp.route("/mgmt/departments")
class DepartmentsMgmtApi(MethodView):
    """查詢所有部門清單"""

    @jwt_required()
    @blp.response(200, RspMsgListSchema)
    def get(self):
        umc = UserMgmtController()
        departments = umc.get_departments()
        return response_data_result(content=departments, msg="查詢成功")


@blp.route("/mgmt/hierarchy")
class HierarchyApi(MethodView):
    """設定主管-下屬關係"""

    @jwt_required()
    @blp.arguments(CreateHierarchySchema)
    @blp.response(200, RspMsgDictSchema)
    def post(self, payload):
        hc = HierarchyController()
        result, flag = hc.set_relation(payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result, msg="層級關係設定成功")


@blp.route("/mgmt/hierarchy/<string:relation_id>")
class HierarchyDeleteApi(MethodView):
    """刪除層級關係"""

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def delete(self, relation_id):
        hc = HierarchyController()
        result, flag = hc.remove_relation(relation_id)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)


@blp.route("/mgmt/<string:work_no>/subordinates")
class SubordinatesApi(MethodView):
    """獲取下屬列表（?all_levels=true 返回所有層級）"""

    @jwt_required()
    @blp.arguments(QuerySubordinatesSchema, location="query")
    @blp.response(200, RspMsgListSchema)
    def get(self, payload, work_no):
        hc = HierarchyController()
        users, flag, msg = hc.get_subordinates(work_no, payload.get("all_levels", False))
        if not flag:
            return fail_response_result(msg=msg)
        return response_data_result(content=users, msg="查詢成功")


@blp.route("/mgmt/<string:work_no>/supervisors")
class SupervisorsApi(MethodView):
    """獲取直屬主管列表"""

    @jwt_required()
    @blp.response(200, RspMsgListSchema)
    def get(self, work_no):
        hc = HierarchyController()
        users, flag, msg = hc.get_supervisors(work_no)
        if not flag:
            return fail_response_result(msg=msg)
        return response_data_result(content=users, msg="查詢成功")


@blp.route("/mgmt/<string:work_no>/team")
class TeamTreeApi(MethodView):
    """獲取以該用戶為根的完整層級樹"""

    @jwt_required()
    @blp.response(200, RspMsgDictSchema)
    def get(self, work_no):
        hc = HierarchyController()
        tree = hc.get_team_tree(work_no)
        if not tree:
            return fail_response_result(msg="用戶不存在或無下屬")
        return response_data_result(content=tree, msg="查詢成功")


# ──────────────────────────────────────────────────────────────
#  角色管理 API
# ──────────────────────────────────────────────────────────────

@blp.route("/mgmt/roles")
class RolesApi(MethodView):
    """列出所有角色 / 新增角色"""

    @jwt_required()
    @blp.response(200, RspRolesSchema)
    def get(self):
        rmc = RoleMgmtController()
        roles = rmc.list_roles()
        return response_data_result(content=roles, msg="查詢成功")

    @jwt_required()
    @blp.arguments(CreateRoleSchema)
    @blp.response(200, RspRoleSchema)
    def post(self, payload):
        rmc = RoleMgmtController()
        result, flag = rmc.create_role(payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result, msg="新增角色成功")


@blp.route("/mgmt/roles/<int:code>")
class RoleDetailApi(MethodView):
    """更新 / 刪除單個角色"""

    @jwt_required()
    @blp.arguments(UpdateRoleSchema)
    @blp.response(200, RspRoleSchema)
    def put(self, payload, code):
        rmc = RoleMgmtController()
        result, flag = rmc.update_role(code, payload)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result, msg="更新角色成功")

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def delete(self, code):
        rmc = RoleMgmtController()
        result, flag = rmc.delete_role(code)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)


@blp.route("/mgmt/user/<string:work_no>/role")
class UserRoleApi(MethodView):
    """查詢 / 分配 / 移除用戶角色"""

    @jwt_required()
    @blp.response(200, RspUserRoleSchema)
    def get(self, work_no):
        urmc = UserRoleMgmtController()
        result = urmc.get_user_role(work_no)
        return response_data_result(content=result, msg="查詢成功")

    @jwt_required()
    @blp.arguments(AssignRoleSchema)
    @blp.response(200, RspUserRoleSchema)
    def put(self, payload, work_no):
        urmc = UserRoleMgmtController()
        result, flag = urmc.assign_role(work_no, payload["role_code"])
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(content=result, msg="角色分配成功")

    @jwt_required()
    @blp.response(200, RspMsgSchema)
    def delete(self, work_no):
        urmc = UserRoleMgmtController()
        result, flag = urmc.remove_role(work_no)
        if not flag:
            return fail_response_result(msg=result)
        return response_data_result(msg=result)

