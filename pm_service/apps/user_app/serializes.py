# -*- coding: utf-8 -*-
"""
@文件: serializes.py
@說明:
@時間: 2024/03/06 16:01:01
@作者: LiDong
"""


from marshmallow import Schema, fields, validate


class LogInSchema(Schema):
    work_no = fields.Str(required=True)
    password = fields.Str(required=True)
    location = fields.Str(
        required=True,
        validate=validate.OneOf(
            [
                "鵬鼎園區",
                "禮鼎園區",
                "大園園區",
                "先豐園區",
                "印度園區",
                "鹏鼎园区",
                "礼鼎园区",
                "大园园区",
                "先丰园区",
                "印度园区",
            ]
        ),
        error="The location must be one of: 鵬鼎園區, 禮鼎園區, 大園園區, 先豐園區, 印度園區.",
    )


class RspLogInLogOutSchema(Schema):
    code = fields.Str(required=True)
    msg = fields.Str(required=True)
    content = fields.Dict()


class UserProjectListSchema(Schema):
    project_id = fields.Str()
    project_nm = fields.Str()
    sum_num = fields.Int()
    doing_num = fields.Int()
    finished_num = fields.Int()


# /api/user/index
class UserContentSchema(Schema):
    total_task_num = fields.Dict()
    total_progress_record_num = fields.Int()
    total_awaiting_review_num = fields.Dict()


# api/user/project
class UserProjectSchema(Schema):
    status = fields.Int(required=True)
    size = fields.Int()


# api/user/project - content
class UserProjectContentSchema(Schema):
    project_id = fields.Str()
    project_nm = fields.Str()
    function_num = fields.Int()
    doing_function_num = fields.Int()
    finished_function_num = fields.Int()
    progress = fields.Str()
    product_pm = fields.Str()


# api/user/project
class RspUserProjectSchema(Schema):
    content = fields.List(fields.Nested(UserProjectContentSchema))


# api/user/temporary_duty
class UserTempDutySchema(Schema):
    status = fields.Int(required=True)
    size = fields.Int()


# api/user/temporary_duty - content
class UserTempDutyContentSchema(Schema):
    duty_id = fields.Str()
    duty_nm = fields.Str()
    priority = fields.Int()
    progress = fields.Str()
    creator = fields.Str()
    responsible = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    start_time = fields.Str()
    end_time = fields.Str()


# api/user/temporary_duty - schema
class UserTempDutyContentDumpSchema(Schema):
    id = fields.Str()
    duty_nm = fields.Str()
    priority = fields.Int()
    progress = fields.Str()
    creator = fields.Str()
    responsible = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    latest_expected_end_date = fields.Str()
    revision_count = fields.Int()
    start_time = fields.Str()
    end_time = fields.Str()
    status = fields.Int()


# api/user/temporary_duty
class RspUserTempDutySchema(Schema):
    content = fields.List(fields.Nested(UserTempDutyContentSchema))


# api/user/latest_news
class UserLstestNewsSchema(Schema):
    page = fields.Int(required=True)
    size = fields.Int()


# api/user/latest_news - content
class UserLstestContentSchema(Schema):
    operator = fields.Str()
    matter = fields.Str()
    created_at = fields.Str()


# api/user/latest_news
class RspUserLstestNewsSchema(Schema):
    code = fields.Str()
    msg = fields.Str()
    content = fields.List(fields.Nested(UserLstestContentSchema))


# api/user/statistical
class UserStatisticalContentSchema(Schema):
    doing_project_num = fields.Int()
    finished_project_num = fields.Int()
    doing_duty_num = fields.Int()
    finished_duty_num = fields.Int()
    unstart_duty_num = fields.Int()


# api/user/statistical
class RspUserStatisticalSchema(Schema):
    code = fields.Str()
    msg = fields.Str()
    content = fields.Nested(UserStatisticalContentSchema)


class RspUserPageSchema(Schema):
    code = fields.Str()
    msg = fields.Str()
    content = fields.Nested(UserContentSchema)


class TaskListSchema(Schema):
    task_status = fields.Int(
        required=True,
        validate=validate.OneOf(
            [0, 1, 2, 3],
            error="status must be number 0 or 1 or 2 or 3",
        ),
    )


class TaskListProjectListTaskSchema(Schema):
    function_id = fields.Str()
    function_nm = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    developers = fields.List(fields.Str())
    priority = fields.Int()
    progress = fields.Str()
    files = fields.List(fields.Str())
    images = fields.List(fields.Str())
    videos = fields.List(fields.Str())


class TaskListProjectListSchema(Schema):
    project_id = fields.Str()
    project_nm = fields.Str()
    task_num = fields.Int()
    task_list = fields.List(fields.Nested(TaskListProjectListTaskSchema))


class TaskListContentSchema(Schema):
    total_task_num = fields.Int()
    project_list = fields.List(fields.Nested(TaskListProjectListSchema))


class RspTaskListSchema(Schema):
    code = fields.Str()
    msg = fields.Str()
    content = fields.Nested(TaskListContentSchema)


class ProjectDataSchema(Schema):
    id = fields.Str()
    images = fields.Str()
    files = fields.Str()
    videos = fields.Str()
    reserved1 = fields.Str()
    reserved2 = fields.Str()
    created_at = fields.Str()
    status_update_at = fields.Str()
    project_nm = fields.Str()
    describe = fields.Str()
    architecture_diagram = fields.Str()
    flowchart = fields.Str()
    interface_design_drawing = fields.Str()
    interface_documentation = fields.Str()
    framework_code = fields.Str()
    datasheet_documentation = fields.Str()
    department = fields.Str()
    expected_completion_time = fields.Str()
    creator = fields.Str()
    product_pm = fields.Str()
    project_pm = fields.Str()
    developers = fields.Str()
    progress = fields.Int()
    priority = fields.Int()
    status = fields.Int()


class FunctionDataSchema(Schema):
    id = fields.Str()
    images = fields.Str()
    files = fields.Str()
    videos = fields.Str()
    reserved1 = fields.Str()
    reserved2 = fields.Str()
    created_at = fields.Str()
    status_update_at = fields.Str()
    project_id = fields.Str()
    function_nm = fields.Str()
    describe = fields.Str()
    expected_start_date = fields.Str()
    expected_end_date = fields.Str()
    start_time = fields.Str()
    end_time = fields.Str()
    developers = fields.Str()
    progress = fields.Int()
    priority = fields.Int()
    status = fields.Int()


class ProgressRecordDataSchema(Schema):
    id = fields.Str()
    images = fields.Str()
    files = fields.Str()
    videos = fields.Str()
    reserved1 = fields.Str()
    reserved2 = fields.Str()
    created_at = fields.Str()
    status_update_at = fields.Str()
    function_id = fields.Str()
    progress_record = fields.Str()
    submitter = fields.Str()
    progress = fields.Int()
    unread = fields.Int()
    status = fields.Int()


class PorjectIdAndNameSchema(Schema):
    id = fields.Str()
    project_nm = fields.Str()


class MyApplySchema(Schema):
    status = fields.Int(
        validate=validate.OneOf([1, 2, 3], error="status must be 1 or 2 or 3"),
    )
    page = fields.Int()
    size = fields.Int()


class AuditRecordSchema(Schema):
    page = fields.Int()
    size = fields.Int()


# ──────────────────────────────────────────────
#  用戶管理 - 請求 Schema
# ──────────────────────────────────────────────

class CreateUserMgmtSchema(Schema):
    """POST /api/user/mgmt/user - 新增用戶"""
    work_no    = fields.Str(required=True, metadata={"description": "工號"})
    name       = fields.Str(required=True, metadata={"description": "姓名"})
    department = fields.Str(load_default=None, metadata={"description": "部門"})
    position   = fields.Str(load_default=None, metadata={"description": "職位"})
    email      = fields.Str(load_default=None, metadata={"description": "郵箱"})
    phone      = fields.Str(load_default=None, metadata={"description": "電話"})
    remark     = fields.Str(load_default=None, metadata={"description": "備注"})


class UpdateUserMgmtSchema(Schema):
    """PUT /api/user/mgmt/user/<work_no> - 更新用戶資料"""
    name       = fields.Str(load_default=None)
    department = fields.Str(load_default=None)
    position   = fields.Str(load_default=None)
    email      = fields.Str(load_default=None)
    phone      = fields.Str(load_default=None)
    remark     = fields.Str(load_default=None)


class QueryUsersMgmtSchema(Schema):
    """GET /api/user/mgmt/users - 用戶列表查詢參數"""
    page       = fields.Int(load_default=1)
    size       = fields.Int(load_default=20)
    keyword    = fields.Str(load_default="", metadata={"description": "按姓名/工號模糊搜尋"})
    department = fields.Str(load_default="", metadata={"description": "按部門過濾"})


class CreateHierarchySchema(Schema):
    """POST /api/user/mgmt/hierarchy - 設置主管-下屬關係"""
    supervisor_work_no  = fields.Str(required=True, metadata={"description": "主管工號"})
    subordinate_work_no = fields.Str(required=True, metadata={"description": "下屬工號"})
    remark              = fields.Str(load_default="", metadata={"description": "備注"})


class QuerySubordinatesSchema(Schema):
    """GET /api/user/mgmt/<work_no>/subordinates - 查詢下屬"""
    all_levels = fields.Bool(load_default=False, metadata={"description": "是否返回所有層級下屬"})


class CheckPermissionSchema(Schema):
    """GET /api/user/mgmt/check_permission - 權限確認"""
    requester = fields.Str(required=True, metadata={"description": "發起查看的用戶工號"})
    target    = fields.Str(required=True, metadata={"description": "被查看的用戶工號"})


# ──────────────────────────────────────────────
#  用戶管理 - 響應 Schema
# ──────────────────────────────────────────────

class UserProfileContentSchema(Schema):
    work_no    = fields.Str()
    name       = fields.Str()
    department = fields.Str()
    position   = fields.Str()
    email      = fields.Str()
    phone      = fields.Str()
    remark     = fields.Str()
    status     = fields.Int()
    created_at = fields.Str()
    updated_at = fields.Str()


class RspUserMgmtSchema(Schema):
    code    = fields.Str()
    msg     = fields.Str()
    content = fields.Nested(UserProfileContentSchema)


class RspUsersMgmtSchema(Schema):
    code    = fields.Str()
    msg     = fields.Str()
    content = fields.Dict()


class RspPermissionSchema(Schema):
    code    = fields.Str()
    msg     = fields.Str()
    content = fields.Bool()


# ──────────────────────────────────────────────
#  角色管理 - 請求 Schema
# ──────────────────────────────────────────────

class CreateRoleSchema(Schema):
    """POST /api/user/mgmt/roles - 新增角色"""
    name          = fields.Str(required=True, metadata={"description": "角色名稱"})
    superior_code = fields.Int(load_default=None, metadata={"description": "上級角色 code（可選）"})


class UpdateRoleSchema(Schema):
    """PUT /api/user/mgmt/roles/<code> - 更新角色"""
    name          = fields.Str(load_default=None, metadata={"description": "角色名稱"})
    superior_code = fields.Int(load_default=None, metadata={"description": "上級角色 code（傳 null 清除）"})


class AssignRoleSchema(Schema):
    """PUT /api/user/mgmt/user/<work_no>/role - 為用戶分配角色"""
    role_code = fields.Int(required=True, metadata={"description": "角色 code"})


# ──────────────────────────────────────────────
#  角色管理 - 響應 Schema
# ──────────────────────────────────────────────

class RoleContentSchema(Schema):
    code          = fields.Int()
    name          = fields.Str()
    superior_code = fields.Int(allow_none=True)
    created_at    = fields.Str()


class RspRoleSchema(Schema):
    code    = fields.Str()
    msg     = fields.Str()
    content = fields.Nested(RoleContentSchema)


class RspRolesSchema(Schema):
    code    = fields.Str()
    msg     = fields.Str()
    content = fields.List(fields.Nested(RoleContentSchema))


class UserRoleContentSchema(Schema):
    role_code = fields.Int(allow_none=True)
    role_name = fields.Str(allow_none=True)


class RspUserRoleSchema(Schema):
    code    = fields.Str()
    msg     = fields.Str()
    content = fields.Nested(UserRoleContentSchema, allow_none=True)
