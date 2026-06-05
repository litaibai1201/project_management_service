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


class DepartmentModel(db.Model):
    """部门（独立管理，与用户 department 字段合并展示）"""
    __tablename__ = "department_form"

    id         = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    name       = db.Column(db.String(64), nullable=False, unique=True, comment="部门名称")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, nullable=False)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "created_at": self.created_at}


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
    # 1=草稿 2=立案审核 3=规划中 4=规划审核 10=排程安排 11=排程审核 5=执行中 6=完结审核 7=完结 8=搁置 9=删除
    project_status = db.Column(db.Integer, default=1, comment="项目状态")
    priority = db.Column(db.Integer, default=2, comment="优先级(1低2中3高4紧急)")
    expected_start_date = db.Column(db.String(10), comment="预计开始日期")
    expected_end_date = db.Column(db.String(10), comment="预计结束日期")
    end_time = db.Column(db.String(19), comment="实际结束时间")
    code_url = db.Column(db.String(255), comment="代码仓库地址")
    group_id = db.Column(db.String(32), db.ForeignKey("project_group_form.id"), comment="分组ID")
    expected_benefit       = db.Column(db.Text, comment="预期效益描述")
    benefit_amount         = db.Column(db.Float,      comment="预计效益金额/数量")
    benefit_unit           = db.Column(db.String(10), default="元/年", comment="效益单位(元/年|人/年)")
    actual_benefit_amount  = db.Column(db.Float,      comment="实际效益金额/数量（与benefit_unit同单位）")
    progress = db.Column(db.Integer, default=0, comment="完成进度(0-100)")

    def to_dict(self):
        return {
            "id": self.id, "project_nm": self.project_nm, "describe": self.describe or "",
            "department": self.department or "", "product_pm": self.product_pm or "",
            "project_pm": self.project_pm, "creator": self.creator or "",
            "status": self.project_status, "priority": self.priority,
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.expected_end_date or "", "end_time": self.end_time or "",
            "code_url": self.code_url or "", "group_id": self.group_id or "",
            "expected_benefit": self.expected_benefit or "",
            "benefit_amount": self.benefit_amount,
            "benefit_unit": self.benefit_unit or "元/年",
            "actual_benefit_amount": self.actual_benefit_amount,
            "progress": self.progress,
            "created_at": self.created_at, "updated_at": self.update_at or "",
        }

    def to_list_item(self):
        return {
            "id": self.id, "project_nm": self.project_nm, "department": self.department or "",
            "status": self.project_status, "priority": self.priority,
            "product_pm": self.product_pm or "", "project_pm": self.project_pm,
            "progress": self.progress,
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.expected_end_date or "",
        }


class ProjectFileModel(db.Model):
    """项目附件"""
    __tablename__ = "project_file_form"

    id            = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id    = db.Column(db.String(32), nullable=False, index=True, comment="所属项目ID")
    file_nm       = db.Column(db.String(255), nullable=False, comment="原始文件名")
    file_path     = db.Column(db.String(512), nullable=False, comment="磁盘存储相对路径")
    file_size     = db.Column(db.Integer, default=0, comment="文件大小(bytes)")
    file_ext      = db.Column(db.String(20), comment="扩展名")
    file_category = db.Column(db.String(32), default="other", comment="文件分类: requirement/design/progress/other")
    uploader      = db.Column(db.String(32), comment="上传人工号")
    created_at    = db.Column(db.String(19), default=CommonTools.get_now, nullable=False, comment="上传时间")

    def to_dict(self):
        return {
            "id":            self.id,
            "project_id":    self.project_id,
            "file_nm":       self.file_nm,
            "file_size":     self.file_size,
            "file_ext":      self.file_ext,
            "file_category": self.file_category or "other",
            "uploader":      self.uploader,
            "created_at":    self.created_at,
        }


class RequirementModel(BaseMixinModel):
    """专案需求"""
    __tablename__ = "requirement_form"

    id            = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id    = db.Column(db.String(32), db.ForeignKey("project_data_form.id"), nullable=False, index=True)
    req_nm        = db.Column(db.String(128), nullable=False, comment="需求名称")
    describe      = db.Column(db.Text, comment="需求描述")
    priority      = db.Column(db.Integer, default=2, comment="优先级(1低2中3高4紧急)")
    # 0=草稿 1=审核中 2=已通过 3=已拒绝 4=已完结 8=搁置 9=已删除
    req_status    = db.Column(db.Integer, default=0, comment="需求状态")
    progress      = db.Column(db.Integer, default=0, comment="进度(0-100，由关联任务自动计算)")
    creator       = db.Column(db.String(32), comment="创建人工号")
    responsible_json  = db.Column(db.Text,       comment="负责人工号列表(JSON数组)")
    expected_benefit  = db.Column(db.Text,      comment="效益描述")
    benefit_amount    = db.Column(db.Float,      comment="预计效益数量")
    benefit_unit      = db.Column(db.String(10), default="元/年", comment="效益单位")
    files_json            = db.Column(db.Text,       comment="附件列表(JSON数组 [{name,url,size}])")
    expected_end_date     = db.Column(db.String(10), comment="预计结束日期")
    is_addon              = db.Column(db.Boolean, default=False, comment="是否追加需求(效益独立计算)")

    def to_dict(self):
        files = []
        if self.files_json:
            try:
                files = json.loads(self.files_json)
            except Exception:
                pass
        responsible = []
        if self.responsible_json:
            try:
                responsible = json.loads(self.responsible_json)
            except Exception:
                pass
        return {
            "id":                   self.id,
            "project_id":           self.project_id,
            "req_nm":               self.req_nm,
            "describe":             self.describe or "",
            "priority":             self.priority,
            "status":               self.req_status,
            "progress":             self.progress or 0,
            "responsible":          responsible,
            "creator":              self.creator or "",
            "expected_benefit":     self.expected_benefit or "",
            "benefit_amount":       self.benefit_amount,
            "benefit_unit":         self.benefit_unit or "元/年",
            "is_addon":             bool(self.is_addon),
            "files":                files,
            "expected_end_date":    self.expected_end_date or "",
            "created_at":           self.created_at,
            "updated_at":           self.update_at or "",
        }


class FunctionDataModel(BaseMixinModel):
    """项目功能任务"""
    __tablename__ = "function_data_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    function_nm = db.Column(db.String(128), nullable=False, comment="功能名称")
    describe = db.Column(db.Text, comment="描述")
    project_id = db.Column(db.String(32), db.ForeignKey("project_data_form.id"), nullable=False, index=True)
    responsible = db.Column(db.Text, comment="负责人工号列表(JSON数组)")
    priority = db.Column(db.Integer, default=2)
    # 0=草稿(待審核) 1=待开始 2=进行中 3=完结审核 4=已完结 8=搁置 9=删除
    function_status = db.Column(db.Integer, default=1)

    __table_args__ = (
        # 最常见过滤组合：status=1 AND function_status in (...)
        db.Index('ix_func_status_fstatus', 'status', 'function_status'),
    )
    progress = db.Column(db.Integer, default=0)
    expected_start_date = db.Column(db.String(10))
    expected_end_date = db.Column(db.String(10))
    latest_expected_end_date = db.Column(db.String(10), comment="最新预计完成时间（延期后）")
    reschedule_count = db.Column(db.Integer, default=0, comment="延期次数")
    reschedule_log = db.Column(db.Text, comment="延期记录JSON: [{from,to,reason,date,operator}]")
    start_time = db.Column(db.String(19))
    end_time = db.Column(db.String(19))
    group1 = db.Column(db.String(64), comment="功能分组1")
    group2 = db.Column(db.String(64), comment="功能分组2")
    requirement_id = db.Column(db.String(32), db.ForeignKey("requirement_form.id"), nullable=True, index=True, comment="所属需求ID（可选）")

    def to_dict(self):
        reschedule_history = []
        if self.reschedule_log:
            try:
                reschedule_history = json.loads(self.reschedule_log)
            except (ValueError, TypeError):
                pass
        return {
            "id": self.id, "function_nm": self.function_nm, "describe": self.describe or "",
            "project_id": self.project_id,
            "responsible": json.loads(self.responsible) if self.responsible else [],
            "priority": self.priority,
            "status": self.function_status, "progress": self.progress,
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.latest_expected_end_date or self.expected_end_date or "",
            "original_end_date": self.expected_end_date or "",
            "reschedule_count": self.reschedule_count or 0,
            "reschedule_history": reschedule_history,
            "start_time": self.start_time or "", "end_time": self.end_time or "",
            "group1": self.group1 or "", "group2": self.group2 or "",
            "requirement_id": self.requirement_id or "",
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
    is_overtime = db.Column(db.Boolean, default=False, comment="是否加班")
    overtime_hours = db.Column(db.Float, default=0, comment="加班工时")
    is_read = db.Column(db.Integer, default=0)
    files_json = db.Column(db.Text, comment="附件信息(JSON数组)")

    __table_args__ = (
        # 批量查提交人工时/进度记录（get_progress_report / get_anomalies）
        db.Index('ix_prog_rec_submitter', 'submitter'),
        # 异常检测：function_id IN [...] AND created_at >= 7天前
        db.Index('ix_prog_rec_func_created', 'function_id', 'created_at'),
    )

    def to_dict(self):
        coops = []
        if self.cooperator:
            try:
                coops = json.loads(self.cooperator)
            except Exception:
                coops = [self.cooperator]
        raw_files = []
        if self.files_json:
            try:
                raw_files = json.loads(self.files_json)
            except Exception:
                pass
        base = f"/api/project/{self.project_id}/function/{self.function_id}/progress/{self.progress_id}/files"
        files = [{"name": f["name"], "url": f"{base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
        return {
            "progress_id": self.progress_id, "progress": self.progress,
            "progress_record": self.progress_record or "", "submitter": self.submitter,
            "cooperator": coops, "time_consum": self.time_consum or 0,
            "is_overtime": bool(self.is_overtime), "overtime_hours": float(self.overtime_hours or 0),
            "created_at": self.created_at,
            "files": files,
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
    project_id     = db.Column(db.String(32), comment="关联项目ID")
    function_id    = db.Column(db.String(32), comment="关联功能ID")
    duty_id        = db.Column(db.String(32), comment="关联任务ID")
    requirement_id      = db.Column(db.String(32), comment="关联需求ID（单条）")
    requirement_ids_json = db.Column(db.Text, nullable=True, comment="批量关联需求ID列表（JSON）")
    function_ids_json   = db.Column(db.Text, nullable=True, comment="批量关联任务ID列表（JSON）")
    system_id           = db.Column(db.String(32), comment="关联系统ID（系统需求审核用）")
    apply_type = db.Column(db.String(64), comment="申请类型(中文)")
    apply_type_code = db.Column(db.String(32), comment="申请类型编码")
    submitter = db.Column(db.String(32), nullable=False, comment="提交人工号")
    submitter_name = db.Column(db.String(64), comment="提交人姓名")
    reviewer = db.Column(db.Text, comment="审核人工号(JSON数组)")
    # 1=待审 2=通过 3=拒绝 4=退回
    apply_status = db.Column(db.Integer, default=1)

    __table_args__ = (
        # 我提交的审核列表
        db.Index('ix_review_submitter', 'submitter'),
        # 专案维度查审核（get_review_list）
        db.Index('ix_review_project_status', 'project_id', 'apply_status'),
    )
    priority = db.Column(db.Integer, default=2)
    description = db.Column(db.Text)
    approval_nodes_json = db.Column(db.Text, comment="审批节点(JSON)")

    def to_dict(self, project_nm=None, function_nm=None, duty_nm=None, system_nm=None):
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
            "requirement_id": self.requirement_id or "",
            "requirement_ids": json.loads(self.requirement_ids_json) if self.requirement_ids_json else [],
            "function_ids": json.loads(self.function_ids_json) if self.function_ids_json else [],
            "apply_type": self.apply_type or "", "apply_type_code": self.apply_type_code or "",
            "submitter": self.submitter, "submitter_name": self.submitter_name or "",
            "reviewer": reviewers, "status": self.apply_status, "priority": self.priority,
            "description": self.description or "", "approval_nodes": nodes,
            "created_at": self.created_at,
            "system_id": self.system_id or "",
            "project_nm": project_nm or "", "function_nm": function_nm or "",
            "duty_nm": duty_nm or "", "system_nm": system_nm or "",
        }


# ─────────────────────────────────────────────────────────────────────────────
# AR
# ─────────────────────────────────────────────────────────────────────────────

class TemporaryDutyModel(BaseMixinModel):
    """AR"""
    __tablename__ = "temporary_duty_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    duty_nm = db.Column(db.String(128), nullable=False, comment="任务名称")
    describe = db.Column(db.Text)
    creator = db.Column(db.String(32), nullable=False)
    responsible = db.Column(db.Text, comment="负责人工号(JSON数组)")
    # 0=草稿 1=进行中 2=完结审核 3=已完结 8=搁置 9=删除
    duty_status = db.Column(db.Integer, default=0)

    __table_args__ = (
        # 最常见过滤组合：status=1 AND duty_status != 9
        db.Index('ix_duty_status_dstatus', 'status', 'duty_status'),
    )
    priority = db.Column(db.Integer, default=2)
    progress = db.Column(db.Integer, default=0)
    group = db.Column(db.String(64), comment="任务分组(用户自定义)")
    system_id          = db.Column(db.String(32), comment="关联系统ID")
    standalone_req_id  = db.Column(db.String(32), comment="关联独立需求ID")
    expected_start_date = db.Column(db.String(10))
    expected_end_date = db.Column(db.String(10))
    start_time = db.Column(db.String(19))
    end_time = db.Column(db.String(19))
    latest_expected_end_date = db.Column(db.String(10))
    revision_count = db.Column(db.Integer, default=0)
    reschedule_log = db.Column(db.Text, comment="延期记录JSON: [{from,to,reason,date,operator}]")

    def to_dict(self):
        resp = []
        if self.responsible:
            try:
                resp = json.loads(self.responsible)
            except Exception:
                resp = [self.responsible]
        reschedule_history = []
        if self.reschedule_log:
            try:
                reschedule_history = json.loads(self.reschedule_log)
            except (ValueError, TypeError):
                pass
        return {
            "id": self.id, "duty_nm": self.duty_nm, "describe": self.describe or "",
            "creator": self.creator, "responsible": resp, "status": self.duty_status,
            "priority": self.priority, "progress": self.progress, "group": self.group or "",
            "system_id":         self.system_id or "",
            "standalone_req_id": self.standalone_req_id or "",
            "expected_start_date": self.expected_start_date or "",
            "expected_end_date": self.latest_expected_end_date or self.expected_end_date or "",
            "original_end_date": self.expected_end_date or "",
            "reschedule_count": self.revision_count or 0,
            "reschedule_history": reschedule_history,
            "start_time": self.start_time or "", "end_time": self.end_time or "",
            "created_at": self.created_at,
        }


class DutyProgressRecordModel(BaseMixinModel):
    """AR进度记录"""
    __tablename__ = "duty_progress_record_form"

    id = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    duty_id = db.Column(db.String(32), db.ForeignKey("temporary_duty_form.id"), nullable=False, index=True)
    progress = db.Column(db.Integer, default=0)
    progress_record = db.Column(db.Text)
    submitter = db.Column(db.String(32), nullable=False)
    cooperator = db.Column(db.Text, comment="协作人(JSON数组)")
    time_consum = db.Column(db.Float, default=0)
    is_overtime = db.Column(db.Boolean, default=False, comment="是否加班")
    overtime_hours = db.Column(db.Float, default=0, comment="加班工时")
    start_time = db.Column(db.String(10))
    is_read = db.Column(db.Integer, default=0)
    files_json = db.Column(db.Text, comment="附件信息(JSON数组)")

    __table_args__ = (
        # 批量查提交人AR工时（get_progress_report）
        db.Index('ix_duty_prog_submitter', 'submitter'),
        # 日期范围过滤（get_progress_report start_date/end_date）
        db.Index('ix_duty_prog_created', 'created_at'),
    )

    def to_dict(self):
        coops = []
        if self.cooperator:
            try:
                coops = json.loads(self.cooperator)
            except Exception:
                coops = [self.cooperator]
        raw_files = []
        if self.files_json:
            try:
                raw_files = json.loads(self.files_json)
            except Exception:
                pass
        base = f"/api/temporary_duty/{self.duty_id}/progress/{self.id}/files"
        files = [{"name": f["name"], "url": f"{base}/{f['id']}/preview", "size": f.get("size")} for f in raw_files]
        return {
            "progress_id": self.id, "progress": self.progress,
            "progress_record": self.progress_record or "", "submitter": self.submitter,
            "cooperator": coops, "time_consum": self.time_consum or 0,
            "is_overtime": bool(self.is_overtime), "overtime_hours": float(self.overtime_hours or 0),
            "start_time": self.start_time or "", "created_at": self.created_at,
            "files": files,
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


# ─────────────────────────────────────────────────────────────────────────────
# 首页 Widget 配置
# ─────────────────────────────────────────────────────────────────────────────

class UserDashboardConfigModel(db.Model):
    __tablename__ = "user_dashboard_config"

    id          = db.Column(db.Integer, primary_key=True, autoincrement=True)
    work_no     = db.Column(db.String(50), nullable=False, index=True, comment="工号")
    view_type   = db.Column(db.String(20), nullable=False, comment="视角: personal | manager")
    widget_id   = db.Column(db.String(50), nullable=False, comment="Widget ID")
    is_visible  = db.Column(db.Boolean, nullable=False, default=True, comment="是否显示")
    layout_json = db.Column(db.Text, nullable=True, comment="布局JSON: {x,y,w,h}")
    created_at  = db.Column(db.String(19), default=CommonTools.get_now, comment="创建时间")
    updated_at  = db.Column(db.String(19), comment="更新时间")

    __table_args__ = (
        db.UniqueConstraint("work_no", "view_type", "widget_id", name="uq_user_dashboard_config"),
    )

    def to_dict(self):
        return {
            "widget_id":  self.widget_id,
            "is_visible": self.is_visible,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 会议备注
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# 消息通知
# ─────────────────────────────────────────────────────────────────────────────

class NotificationModel(db.Model):
    __tablename__ = "notification_form"

    id         = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    recipient  = db.Column(db.String(32), nullable=False, index=True, comment="接收人工号")
    title      = db.Column(db.String(200), nullable=False, comment="通知标题")
    desc       = db.Column(db.String(500), default="", comment="通知描述")
    # link_type: 'review'|'project'|'duty'|'task'|''
    link_type  = db.Column(db.String(30), default="", comment="跳转类型")
    link_id    = db.Column(db.String(32), default="", comment="跳转目标ID")
    is_read    = db.Column(db.Boolean, default=False, nullable=False, comment="是否已读")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, nullable=False, comment="创建时间")

    def to_dict(self):
        return {
            "id":         self.id,
            "recipient":  self.recipient,
            "title":      self.title,
            "desc":       self.desc or "",
            "link_type":  self.link_type or "",
            "link_id":    self.link_id or "",
            "is_read":    self.is_read,
            "created_at": self.created_at,
        }


# ─────────────────────────────────────────────────────────────────────────────
# 独立需求
# ─────────────────────────────────────────────────────────────────────────────

class StandaloneReqModel(BaseMixinModel):
    """独立需求（不关联专案）"""
    __tablename__ = "standalone_req_form"

    id                = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    req_nm            = db.Column(db.String(128), nullable=False, comment="需求名称")
    describe          = db.Column(db.Text, comment="需求描述")
    priority          = db.Column(db.Integer, default=2, comment="优先级(1低2中3高4紧急)")
    # 0=草稿 1=審核中 2=進行中 3=已拒絕 4=已完結 8=搁置 9=已刪除
    req_status        = db.Column(db.Integer, default=0, comment="需求状态")
    progress          = db.Column(db.Integer, default=0, comment="需求进度(0-100，由绑定任务自动计算)")
    system_id         = db.Column(db.String(32), nullable=False, comment="关联系统ID")
    creator           = db.Column(db.String(32), comment="创建人工号")
    reviewer           = db.Column(db.String(32), comment="审核人工号(首位)")
    reviewer_chain_json= db.Column(db.Text, comment="审核链工号JSON数组")
    responsible        = db.Column(db.Text, comment="负责人工号JSON数组")
    expected_end_date = db.Column(db.String(10), comment="预计完成日期")
    expected_benefit  = db.Column(db.Text,       comment="预估效益描述")
    benefit_amount    = db.Column(db.Float,      comment="预估效益数量")
    benefit_unit      = db.Column(db.String(10), default="元/年", comment="效益单位(元/年|人/年)")
    files_json        = db.Column(db.Text, comment="附件JSON数组")
    created_at        = db.Column(db.String(19), default=CommonTools.get_now, nullable=False)
    updated_at        = db.Column(db.String(19), default=CommonTools.get_now, onupdate=CommonTools.get_now)

    __table_args__ = (
        db.Index('ix_standalone_req_creator', 'creator'),
        db.Index('ix_standalone_req_status',  'req_status'),
    )

    def to_dict(self):
        try:
            resp = json.loads(self.responsible) if self.responsible else []
        except Exception:
            resp = []
        return {
            "id":                 self.id,
            "req_nm":             self.req_nm,
            "describe":           self.describe or "",
            "priority":           self.priority,
            "status":             self.req_status,
            "system_id":          self.system_id or "",
            "creator":            self.creator or "",
            "reviewer":           self.reviewer or "",
            "reviewer_chain":     json.loads(self.reviewer_chain_json) if self.reviewer_chain_json else [],
            "responsible":        resp,
            "progress":           self.progress or 0,
            "expected_end_date":  self.expected_end_date or "",
            "expected_benefit":   self.expected_benefit or "",
            "benefit_amount":     self.benefit_amount,
            "benefit_unit":       self.benefit_unit or "元/年",
            "files":              json.loads(self.files_json) if self.files_json else [],
            "created_at":         self.created_at or "",
            "updated_at":         self.updated_at or "",
        }


# ─────────────────────────────────────────────────────────────────────────────
# 系统管理
# ─────────────────────────────────────────────────────────────────────────────

class SystemModel(BaseMixinModel):
    """系统管理"""
    __tablename__ = "system_form"

    id               = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    sys_nm           = db.Column(db.String(128), nullable=False, comment="系统名称")
    sys_group        = db.Column(db.String(64),  comment="所属分组")
    maintainers      = db.Column(db.Text, comment="维护人员工号JSON数组")
    description      = db.Column(db.Text, comment="系统功能介绍")
    go_live_date     = db.Column(db.String(10),  comment="系统上线时间")
    urls_json        = db.Column(db.Text, comment="访问网址列表JSON [{name,url}]")
    deploy_info_json = db.Column(db.Text, comment="部署详情JSON数组")
    sys_status       = db.Column(db.Integer, default=1, comment="1=正常 9=已删除")
    created_at       = db.Column(db.String(19), default=CommonTools.get_now, nullable=False)
    updated_at       = db.Column(db.String(19), default=CommonTools.get_now, onupdate=CommonTools.get_now)

    __table_args__ = (
        db.Index('ix_system_group', 'sys_group'),
        db.Index('ix_system_status', 'sys_status'),
    )

    def to_dict(self):
        def _load(field):
            try:
                return json.loads(field) if field else []
            except Exception:
                return []
        return {
            "id":          self.id,
            "sys_nm":      self.sys_nm,
            "sys_group":   self.sys_group or "",
            "maintainers": _load(self.maintainers),
            "description": self.description or "",
            "go_live_date":     self.go_live_date or "",
            "urls":             _load(self.urls_json),
            "deploy_info":      _load(self.deploy_info_json),
            "created_at":  self.created_at or "",
            "updated_at":  self.updated_at or "",
        }


class MeetingNoteModel(db.Model):
    __tablename__ = "meeting_note"

    id         = db.Column(db.String(32), primary_key=True, default=generate_uuid)
    project_id = db.Column(db.String(32), nullable=False, index=True, comment="所属专案ID")
    task_id    = db.Column(db.String(32), nullable=True,  index=True, comment="关联功能任务ID（可选）")
    task_name  = db.Column(db.String(128), nullable=True, comment="任务名称快照")
    note_type  = db.Column(db.String(16), nullable=False, comment="備注類型: 決策/行動項/風險/待確認")
    content    = db.Column(db.Text, nullable=False, comment="备注内容")
    author     = db.Column(db.String(32), nullable=False, comment="记录人工号")
    status     = db.Column(db.String(16), nullable=False, default="pending", comment="状态: pending/resolved")
    created_at = db.Column(db.String(19), default=CommonTools.get_now, comment="创建时间")
    updated_at = db.Column(db.String(19), nullable=True, comment="更新时间")

    def to_dict(self, author_name: str = ""):
        return {
            "id":        self.id,
            "projectId": self.project_id,
            "taskId":    self.task_id,
            "taskName":  self.task_name,
            "type":      self.note_type,
            "content":   self.content,
            "author":    author_name or self.author,
            "status":    self.status,
            "createdAt": self.created_at,
        }
