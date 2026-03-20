# -*- coding: utf-8 -*-
"""
@文件: model_tables.py
@说明: 数据库模型定义
@时间: 2023/10/26
"""

import json
import uuid

from utils.tools import CommonTools
from dbs.mysql_db import db


def generate_uuid():
    return uuid.uuid4().hex


# ─────────────────────────────────────────────────────────────────────────────
# 基础混入
# ─────────────────────────────────────────────────────────────────────────────

class BaseMixinModel(db.Model):
    __abstract__ = True

    status = db.Column(db.Integer, default=1, comment="状态(1=正常,0=禁用)")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, nullable=False, comment="创建时间")
    update_at = db.Column(db.String(19), comment="更新时间")
    status_update_at = db.Column(db.String(19), comment="状态更新时间")


# ─────────────────────────────────────────────────────────────────────────────
# 框架演示模型（保留）
# ─────────────────────────────────────────────────────────────────────────────

class TestModel(BaseMixinModel):
    __tablename__ = "test_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid, comment="UUID")
    work_no = db.Column(db.String(32), nullable=False, unique=True, comment="工号")
    password = db.Column(db.String(128), nullable=False, comment="密码")
    username = db.Column(db.String(32), nullable=False, comment="用户名")

    def to_dict(self):
        return {"id": self.id, "work_no": self.work_no, "username": self.username,
                "status": self.status, "created_at": self.created_at}


class OperationLogModel(BaseMixinModel):
    __tablename__ = "operation_log"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid, comment="UUID")
    work_no = db.Column(db.String(32), nullable=False, index=True, comment="操作人工号")
    operation = db.Column(db.String(50), nullable=False, comment="操作类型")
    target_table = db.Column(db.String(50), comment="目标表")
    target_id = db.Column(db.String(32), comment="目标记录ID")
    detail = db.Column(db.Text, comment="操作详情")

    def to_dict(self):
        return {"id": self.id, "work_no": self.work_no, "operation": self.operation,
                "target_table": self.target_table, "detail": self.detail, "created_at": self.created_at}


# ─────────────────────────────────────────────────────────────────────────────
# 用户 & 权限
# ─────────────────────────────────────────────────────────────────────────────

class UserProfileModel(BaseMixinModel):
    """用户档案"""
    __tablename__ = "user_profile_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    work_no = db.Column(db.String(32), nullable=False, unique=True, index=True, comment="工号")
    name = db.Column(db.String(64), nullable=False, comment="姓名")
    department = db.Column(db.String(128), comment="部门")
    position = db.Column(db.String(64), comment="职位")
    email = db.Column(db.String(128), comment="邮箱")
    phone = db.Column(db.String(32), comment="电话")
    password = db.Column(db.String(128), comment="密码(哈希)")
    location = db.Column(db.String(64), comment="所在园区")

    def to_dict(self):
        return {
            "work_no": self.work_no, "name": self.name,
            "department": self.department or "", "position": self.position or "",
            "email": self.email or "", "phone": self.phone or "",
            "location": self.location or "", "status": self.status,
            "created_at": self.created_at,
        }


class RoleModel(db.Model):
    """角色"""
    __tablename__ = "role_form"

    code = db.Column(db.String(32), primary_key=True, comment="角色编码")
    name = db.Column(db.String(64), nullable=False, comment="角色名称")
    describe = db.Column(db.String(255), comment="描述")
    created_at = db.Column(db.String(19), default=CommonTools.get_now)


class UserRoleModel(db.Model):
    """用户-角色关联"""
    __tablename__ = "user_role_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    work_no = db.Column(db.String(32), nullable=False, index=True)
    role_code = db.Column(db.String(32), db.ForeignKey("role_form.code"))
    created_at = db.Column(db.String(19), default=CommonTools.get_now)


class HierarchyModel(db.Model):
    """上下级关系"""
    __tablename__ = "hierarchy_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    supervisor_work_no = db.Column(db.String(32), nullable=False, index=True, comment="上级工号")
    subordinate_work_no = db.Column(db.String(32), nullable=False, index=True, comment="下级工号")
    created_at = db.Column(db.String(19), default=CommonTools.get_now)

    def to_dict(self):
        return {"id": self.id, "supervisor_work_no": self.supervisor_work_no,
                "subordinate_work_no": self.subordinate_work_no}


# ─────────────────────────────────────────────────────────────────────────────
# 系统管理
# ─────────────────────────────────────────────────────────────────────────────

class AdminUserModel(db.Model):
    """系统管理员"""
    __tablename__ = "admin_user_form"

    id         = db.Column(db.String(32),  primary_key=True, default=generate_uuid)
    username   = db.Column(db.String(64),  nullable=False, unique=True, index=True, comment="登录账号")
    password   = db.Column(db.String(256), nullable=False, comment="密码")
    name       = db.Column(db.String(64),  nullable=False, comment="显示名")
    status     = db.Column(db.Integer,     default=1, comment="1=启用 0=禁用")
    last_login = db.Column(db.String(19),  comment="最后登录时间")
    created_at = db.Column(db.String(19),  default=CommonTools.get_now)

    def to_dict(self):
        return {
            "id": self.id, "username": self.username,
            "name": self.name, "status": self.status,
            "last_login": self.last_login, "created_at": self.created_at,
        }


class SystemConfigModel(db.Model):
    """系统配置"""
    __tablename__ = "system_config_form"

    id           = db.Column(db.String(32),  primary_key=True, default=generate_uuid)
    config_key   = db.Column(db.String(64),  nullable=False, unique=True, index=True, comment="配置键")
    config_value = db.Column(db.Text,        comment="配置值")
    description  = db.Column(db.String(255), comment="描述")
    updated_at   = db.Column(db.String(19),  default=CommonTools.get_now)

    def to_dict(self):
        return {
            "key": self.config_key, "value": self.config_value,
            "description": self.description, "updated_at": self.updated_at,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 项目管理
# ─────────────────────────────────────────────────────────────────────────────

class ProjectGroupModel(BaseMixinModel):
    """项目分组"""
    __tablename__ = "project_group_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    group_nm = db.Column(db.String(64), nullable=False, comment="分组名称")
    creator = db.Column(db.String(32), comment="创建人工号")

    def to_dict(self):
        return {"id": self.id, "group_nm": self.group_nm}


class ProjectDataModel(BaseMixinModel):
    """项目"""
    __tablename__ = "project_data_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_nm = db.Column(db.String(128), nullable=False, comment="项目名称")
    describe = db.Column(db.Text, comment="项目描述")
    department = db.Column(db.String(128), comment="所属部门")
    product_pm = db.Column(db.String(32), comment="产品PM工号")
    project_pm = db.Column(db.String(32), nullable=False, comment="项目PM工号")
    creator = db.Column(db.String(32), comment="创建人工号")
    # 1=草稿 2=立案审核 3=规划中 4=规划审核 5=执行中 6=完结审核 7=完结 8=搁置 9=删除
    project_status = db.Column(db.Integer, default=1, comment="项目状态")
    priority = db.Column(db.Integer, default=2, comment="优先级(1低2中3高4紧急)")
    expected_end_date = db.Column(db.String(10), comment="预计结束日期")
    end_time = db.Column(db.String(19), comment="实际结束时间")
    code_url = db.Column(db.String(255), comment="代码仓库地址")
    group_id = db.Column(db.String(32), db.ForeignKey("project_group_form.id"), comment="分组ID")
    expected_benefit = db.Column(db.Text, comment="预期效益")
    progress = db.Column(db.Integer, default=0, comment="完成进度(0-100)")

    def to_dict(self):
        return {
            "id": self.id, "project_nm": self.project_nm, "describe": self.describe or "",
            "department": self.department or "", "product_pm": self.product_pm or "",
            "project_pm": self.project_pm, "creator": self.creator or "",
            "status": self.project_status, "priority": self.priority,
            "expected_end_date": self.expected_end_date or "", "end_time": self.end_time or "",
            "code_url": self.code_url or "", "group_id": self.group_id or "",
            "expected_benefit": self.expected_benefit or "", "progress": self.progress,
            "created_at": self.created_at, "updated_at": self.update_at or "",
        }

    def to_list_item(self):
        return {
            "id": self.id, "project_nm": self.project_nm, "department": self.department or "",
            "status": self.project_status, "priority": self.priority,
            "product_pm": self.product_pm or "", "project_pm": self.project_pm,
            "progress": self.progress, "expected_end_date": self.expected_end_date or "",
        }


class FunctionDataModel(BaseMixinModel):
    """项目功能任务"""
    __tablename__ = "function_data_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    function_nm = db.Column(db.String(128), nullable=False, comment="功能名称")
    describe = db.Column(db.Text, comment="描述")
    project_id = db.Column(db.String(32), db.ForeignKey("project_data_form.id"), nullable=False, index=True)
    developers = db.Column(db.Text, comment="开发人员(JSON数组)")
    priority = db.Column(db.Integer, default=2)
    # 1=待开始 2=进行中 3=完结审核 4=已完结 8=搁置 9=删除
    function_status = db.Column(db.Integer, default=1)
    progress = db.Column(db.Integer, default=0)
    expected_start_date = db.Column(db.String(10))
    expected_end_date = db.Column(db.String(10))
    start_time = db.Column(db.String(19))
    end_time = db.Column(db.String(19))
    group1 = db.Column(db.String(64), comment="功能分组1")
    group2 = db.Column(db.String(64), comment="功能分组2")

    def to_dict(self):
        devs = []
        if self.developers:
            try:
                devs = json.loads(self.developers)
            except Exception:
                devs = [self.developers]
        return {
            "id": self.id, "function_nm": self.function_nm, "describe": self.describe or "",
            "project_id": self.project_id, "developers": devs, "priority": self.priority,
            "status": self.function_status, "progress": self.progress,
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.expected_end_date or "",
            "start_time": self.start_time or "", "end_time": self.end_time or "",
            "group1": self.group1 or "", "group2": self.group2 or "",
            "created_at": self.created_at,
        }


class ProgressRecordDataModel(BaseMixinModel):
    """项目功能进度记录"""
    __tablename__ = "progress_record_data_form"

    progress_id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(32), index=True)
    function_id = db.Column(db.String(32), db.ForeignKey("function_data_form.id"), nullable=False, index=True)
    progress = db.Column(db.Integer, default=0)
    progress_record = db.Column(db.Text)
    submitter = db.Column(db.String(32), nullable=False)
    cooperator = db.Column(db.Text, comment="协作人(JSON数组)")
    time_consum = db.Column(db.Float, default=0)
    start_time = db.Column(db.String(10))
    is_read = db.Column(db.Integer, default=0)

    def to_dict(self):
        coops = []
        if self.cooperator:
            try:
                coops = json.loads(self.cooperator)
            except Exception:
                coops = [self.cooperator]
        return {
            "progress_id": self.progress_id, "progress": self.progress,
            "progress_record": self.progress_record or "", "submitter": self.submitter,
            "cooperator": coops, "time_consum": self.time_consum or 0,
            "start_time": self.start_time or "", "created_at": self.created_at,
        }


class MilestoneModel(BaseMixinModel):
    """项目里程碑"""
    __tablename__ = "milestone_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(32), db.ForeignKey("project_data_form.id"), nullable=False, index=True)
    name = db.Column(db.String(128), nullable=False)
    target_date = db.Column(db.String(10), nullable=False)
    milestone_status = db.Column(db.String(16), default="pending")  # pending/achieved/overdue
    note = db.Column(db.Text)
    linked_functions_json = db.Column(db.Text, comment="关联功能ID列表(JSON)")
    achieved_at = db.Column(db.String(19))
    creator = db.Column(db.String(32))

    def to_dict(self):
        linked = []
        if self.linked_functions_json:
            try:
                linked = json.loads(self.linked_functions_json)
            except Exception:
                pass
        return {
            "id": self.id, "project_id": self.project_id, "name": self.name,
            "target_date": self.target_date, "status": self.milestone_status,
            "note": self.note or "", "linked_functions": linked,
            "achieved_at": self.achieved_at or "",
        }


class ReviewApplyModel(BaseMixinModel):
    """审核申请记录"""
    __tablename__ = "review_apply_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(32), comment="关联项目ID")
    function_id = db.Column(db.String(32), comment="关联功能ID")
    duty_id = db.Column(db.String(32), comment="关联任务ID")
    apply_type = db.Column(db.String(64), comment="申请类型(中文)")
    apply_type_code = db.Column(db.String(32), comment="申请类型编码")
    submitter = db.Column(db.String(32), nullable=False, comment="提交人工号")
    submitter_name = db.Column(db.String(64), comment="提交人姓名")
    reviewer = db.Column(db.Text, comment="审核人工号(JSON数组)")
    # 1=待审 2=通过 3=拒绝 4=退回
    apply_status = db.Column(db.Integer, default=1)
    priority = db.Column(db.Integer, default=2)
    description = db.Column(db.Text)
    approval_nodes_json = db.Column(db.Text, comment="审批节点(JSON)")

    def to_dict(self, project_nm=None, function_nm=None, duty_nm=None):
        nodes = []
        if self.approval_nodes_json:
            try:
                nodes = json.loads(self.approval_nodes_json)
            except Exception:
                pass
        reviewers = []
        if self.reviewer:
            try:
                reviewers = json.loads(self.reviewer)
            except Exception:
                reviewers = [self.reviewer]
        return {
            "id": self.id, "project_id": self.project_id or "",
            "function_id": self.function_id or "", "duty_id": self.duty_id or "",
            "apply_type": self.apply_type or "", "apply_type_code": self.apply_type_code or "",
            "submitter": self.submitter, "submitter_name": self.submitter_name or "",
            "reviewer": reviewers, "status": self.apply_status, "priority": self.priority,
            "description": self.description or "", "approval_nodes": nodes,
            "created_at": self.created_at,
            "project_nm": project_nm or "", "function_nm": function_nm or "",
            "duty_nm": duty_nm or "",
        }


# ─────────────────────────────────────────────────────────────────────────────
# 临时任务
# ─────────────────────────────────────────────────────────────────────────────

class TemporaryDutyModel(BaseMixinModel):
    """临时任务"""
    __tablename__ = "temporary_duty_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    duty_nm = db.Column(db.String(128), nullable=False, comment="任务名称")
    describe = db.Column(db.Text)
    creator = db.Column(db.String(32), nullable=False)
    responsible = db.Column(db.Text, comment="负责人工号(JSON数组)")
    # 0=草稿 1=进行中 2=完结审核 3=已完结 8=搁置 9=删除
    duty_status = db.Column(db.Integer, default=0)
    priority = db.Column(db.Integer, default=2)
    progress = db.Column(db.Integer, default=0)
    group = db.Column(db.String(64), comment="任务分组(用户自定义)")
    expected_start_date = db.Column(db.String(10))
    expected_end_date = db.Column(db.String(10))
    start_time = db.Column(db.String(19))
    end_time = db.Column(db.String(19))
    latest_expected_end_date = db.Column(db.String(10))
    revision_count = db.Column(db.Integer, default=0)

    def to_dict(self):
        resp = []
        if self.responsible:
            try:
                resp = json.loads(self.responsible)
            except Exception:
                resp = [self.responsible]
        return {
            "id": self.id, "duty_nm": self.duty_nm, "describe": self.describe or "",
            "creator": self.creator, "responsible": resp, "status": self.duty_status,
            "priority": self.priority, "progress": self.progress, "group": self.group or "",
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.expected_end_date or "",
            "start_time": self.start_time or "", "end_time": self.end_time or "",
            "latest_expected_end_date": self.latest_expected_end_date or "",
            "revision_count": self.revision_count or 0, "created_at": self.created_at,
        }


class DutyProgressRecordModel(BaseMixinModel):
    """临时任务进度记录"""
    __tablename__ = "duty_progress_record_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    duty_id = db.Column(db.String(32), db.ForeignKey("temporary_duty_form.id"), nullable=False, index=True)
    progress = db.Column(db.Integer, default=0)
    progress_record = db.Column(db.Text)
    submitter = db.Column(db.String(32), nullable=False)
    cooperator = db.Column(db.Text, comment="协作人(JSON数组)")
    time_consum = db.Column(db.Float, default=0)
    start_time = db.Column(db.String(10))
    is_read = db.Column(db.Integer, default=0)

    def to_dict(self):
        coops = []
        if self.cooperator:
            try:
                coops = json.loads(self.cooperator)
            except Exception:
                coops = [self.cooperator]
        return {
            "progress_id": self.id, "progress": self.progress,
            "progress_record": self.progress_record or "", "submitter": self.submitter,
            "cooperator": coops, "time_consum": self.time_consum or 0,
            "start_time": self.start_time or "", "created_at": self.created_at,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 日报
# ─────────────────────────────────────────────────────────────────────────────

class DailyLogModel(BaseMixinModel):
    """日报"""
    __tablename__ = "daily_log_form"

    log_id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    work_no = db.Column(db.String(32), nullable=False, index=True)
    log_date = db.Column(db.String(10), nullable=False, index=True, comment="日期(YYYY-MM-DD)")
    task_items_json = db.Column(db.Text, comment="任务条目(JSON)")
    free_items_json = db.Column(db.Text, comment="自由条目(JSON)")
    remark = db.Column(db.Text)
    log_status = db.Column(db.Integer, default=1, comment="1=草稿 2=已提交")
    total_hours = db.Column(db.Float, default=0)

    def to_summary_dict(self, user_name=None):
        return {
            "log_id": self.log_id, "work_no": self.work_no, "user_name": user_name or "",
            "log_date": self.log_date, "total_hours": self.total_hours,
            "status": self.log_status, "created_at": self.created_at,
            "updated_at": self.update_at or "",
        }

    def to_detail_dict(self, user_name=None):
        task_items, free_items = [], []
        if self.task_items_json:
            try:
                task_items = json.loads(self.task_items_json)
            except Exception:
                pass
        if self.free_items_json:
            try:
                free_items = json.loads(self.free_items_json)
            except Exception:
                pass
        return {
            "log_id": self.log_id, "work_no": self.work_no, "user_name": user_name or "",
            "log_date": self.log_date, "total_hours": self.total_hours,
            "status": self.log_status, "task_items": task_items, "free_items": free_items,
            "remark": self.remark or "", "created_at": self.created_at,
            "updated_at": self.update_at or "",
        }
