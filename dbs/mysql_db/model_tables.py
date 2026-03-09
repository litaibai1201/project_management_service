# -*- coding: utf-8 -*-
"""
@文件: all_db.py
@說明: 模型類
@時間: 2023/10/26 16:54:19
@作者: LiDong
"""

from common.common_tools import get_now, get_timestamp
from dbs.mysql_db import db


class BaseModel(db.Model):
    __abstract__ = True

    id = db.Column(
        db.String(16),
        nullable=False,
        primary_key=True,
        default=get_timestamp,
        comment="主鍵, 時間戳",
    )
    created_at = db.Column(
        db.String(19), default=get_now, nullable=False, comment="創建時間"
    )


class BaseMixinModel(BaseModel):
    __abstract__ = True

    reserved1 = db.Column(db.String(256), comment="預留字段1")
    reserved2 = db.Column(db.String(256), comment="預留字段2")
    updated_at = db.Column(db.String(19), comment="更新時間")


class BaseMaxinModel(BaseModel):
    __abstract__ = True

    status = db.Column(db.Integer, default=1, comment="状态: 0--刪除,1--存在")
    status_update_at = db.Column(db.String(19), comment="状态更新時間")


class ProjectDataModel(BaseMaxinModel, BaseMixinModel):
    __tablename__ = "project_data_form"

    id = db.Column(
        db.String(16), nullable=False, primary_key=True, comment="主鍵, 時間戳"
    )
    project_nm = db.Column(db.String(128), nullable=False, comment="專案名稱")
    describe = db.Column(db.Text, nullable=False, comment="專案描述")
    code_url = db.Column(db.String(256), comment="代碼地址")
    department = db.Column(db.String(128), nullable=False, comment="部門")
    path = db.Column(db.String(256), comment="文件路徑")
    expected_end_date = db.Column(db.String(10), comment="期望完成日期")
    creator = db.Column(db.String(16), nullable=False, comment="創建者")
    product_pm = db.Column(db.String(32), comment="產品PM")
    project_pm = db.Column(db.String(32), comment="專案PM")
    end_time = db.Column(db.String(19), comment="實際結束时间")
    latest_expected_end_date = db.Column(db.String(10), comment="重訂時間")
    revision_count = db.Column(db.Integer, comment="修訂次數")
    developers = db.Column(db.String(512), comment="開發人員")
    priority = db.Column(
        db.Integer, default=1, nullable=False, comment="優先級，1--正常；2--緊急"
    )
    status = db.Column(
        db.Integer,
        default=1,
        nullable=False,
        comment="狀態，0--已刪除；1--待上傳資料；2--專案審核中；3--架構規劃中； 4--架構審核中；5--開發中；6--完結審核中；7--完結；8--暫停",
    )
    function_data = db.relationship("FunctionDataModel", backref="project_data_form")
    review_data = db.relationship(
        "ProjectApplyRecordModel", backref="project_data_form"
    )
    group_id = db.Column(db.Integer, nullable=False, comment="外鍵: project_group_form")
    last_status = db.Column(db.Integer, comment="記錄暫停前專案的狀態")


class FunctionDataModel(BaseMaxinModel, BaseMixinModel):
    __tablename__ = "function_data_form"

    id = db.Column(
        db.String(16), nullable=False, primary_key=True, comment="主鍵, 時間戳"
    )
    project_id = db.Column(
        db.String(16),
        db.ForeignKey("project_data_form.id"),
        nullable=False,
        comment="外鍵: project_data_form",
    )
    function_nm = db.Column(db.String(128), nullable=False, comment="功能名稱")
    describe = db.Column(db.Text, nullable=False, comment="功能描述")
    path = db.Column(db.String(256), comment="文件路徑")
    expected_start_date = db.Column(db.String(10), comment="預計開始日期")
    expected_end_date = db.Column(db.String(10), comment="預計結束日期")
    latest_expected_end_date = db.Column(db.String(10), comment="重訂時間")
    revision_count = db.Column(db.Integer, comment="修訂次數")
    start_time = db.Column(db.String(19), comment="實際開始时间")
    end_time = db.Column(db.String(19), comment="實際結束时间")
    developers = db.Column(db.String(256), comment="開發人員")
    progress = db.Column(db.Integer, default=0, nullable=False, comment="進度: 0-100")
    priority = db.Column(
        db.Integer, default=1, nullable=False, comment="優先級，1--正常；2--緊急"
    )
    status = db.Column(
        db.Integer,
        default=1,
        nullable=False,
        comment="狀態， 0--刪除；1--存在；2--進行中；3--完成；4--待審核；8--暫停",
    )
    progress_record_data = db.relationship(
        "ProgressRecordDataModel", backref="function_data_form"
    )
    review_data = db.relationship(
        "ProjectApplyRecordModel", backref="function_data_form"
    )
    group1 = db.Column(db.String(32), comment="組1")
    group2 = db.Column(db.String(32), comment="組2")
    last_status = db.Column(db.Integer, comment="記錄暫停前任務的狀態")


class ProgressRecordDataModel(BaseMixinModel):
    __tablename__ = "progress_record_data_form"

    id = db.Column(
        db.String(16), nullable=False, primary_key=True, comment="主鍵, 時間戳"
    )
    function_id = db.Column(
        db.String(16),
        db.ForeignKey("function_data_form.id"),
        nullable=False,
        comment="外鍵: function_data_form",
    )
    progress_record = db.Column(db.Text, nullable=False, comment="進度記錄")
    path = db.Column(db.String(256), comment="文件路徑")
    progress = db.Column(db.Integer, nullable=False, comment="進度: 0-100")
    submitter = db.Column(db.String(16), nullable=False, comment="提交人")
    reader = db.Column(db.Text, comment="已讀人員")
    cooperator = db.Column(db.String(64), comment="合作人，用;隔開")
    time_consum = db.Column(db.String(8), nullable=False, comment="耗時: 單位 h")


class ProjectApplyRecordModel(BaseModel):
    __tablename__ = "project_apply_record_form"

    project_id = db.Column(
        db.String(16),
        db.ForeignKey("project_data_form.id"),
        nullable=False,
        comment="外鍵: project_data_form",
    )
    function_id = db.Column(
        db.String(16),
        db.ForeignKey("function_data_form.id"),
        comment="外鍵: function_data_form",
    )
    apply_type = db.Column(db.String(32), nullable=False, comment="提交類型")
    submitter = db.Column(db.String(16), nullable=False, comment="提交人")
    reviewer = db.Column(
        db.String(256), nullable=False, comment="審核人，用';'進行分割"
    )
    status = db.Column(
        db.Integer, default=1, comment="狀態: 1--待處理，2--撤銷，3--同意，0--拒絕"
    )
    updated_at = db.Column(db.String(19), comment="更新時間")
    priority = db.Column(
        db.Integer, default=1, nullable=False, comment="優先級，1--正常；2--緊急"
    )


class TemporaryDutyModel(BaseMaxinModel, BaseMixinModel):
    __tablename__ = "temporary_duty_form"

    duty_nm = db.Column(db.String(128), nullable=False, comment="任務名稱")
    describe = db.Column(db.Text, nullable=False, comment="任務描述")
    path = db.Column(db.String(256), comment="文件路徑")
    code_url = db.Column(db.String(256), comment="代碼地址")
    department = db.Column(db.String(128), nullable=False, comment="部門")
    expected_start_date = db.Column(db.String(10), comment="預計開始日期")
    expected_end_date = db.Column(db.String(10), comment="預計結束日期")
    latest_expected_end_date = db.Column(db.String(10), comment="重訂時間")
    revision_count = db.Column(db.Integer, comment="修訂次數")
    start_time = db.Column(db.String(19), comment="實際開始时间")
    end_time = db.Column(db.String(19), comment="實際結束时间")
    creator = db.Column(db.String(16), nullable=False, comment="創建者")
    responsible = db.Column(db.String(256), comment="責任人，以分號';'進行分割")
    progress = db.Column(db.Integer, default=0, nullable=False, comment="進度: 0-100")
    priority = db.Column(
        db.Integer, default=1, nullable=False, comment="優先級，1--正常；2--緊急"
    )
    status = db.Column(
        db.Integer,
        default=1,
        nullable=False,
        comment="狀態， 0--刪除；1--存在；2--進行中；3--完成；4--待審核；8--暫停",
    )
    progress_record_data = db.relationship(
        "TemporaryDutyRecordDataModel", backref="temporary_duty_form"
    )
    review_data = db.relationship(
        "TemporaryDutyApplyRecordModel", backref="temporary_duty_form"
    )
    last_status = db.Column(db.Integer, comment="記錄暫停前任務的狀態")


class TemporaryDutyRecordDataModel(BaseMixinModel):
    __tablename__ = "temporary_duty_record_form"

    duty_id = db.Column(
        db.String(16),
        db.ForeignKey("temporary_duty_form.id"),
        nullable=False,
        comment="外鍵: temporary_duty_form",
    )
    progress_record = db.Column(db.Text, nullable=False, comment="進度記錄")
    path = db.Column(db.String(256), comment="文件路徑")
    progress = db.Column(db.Integer, nullable=False, comment="進度: 0-100")
    submitter = db.Column(db.String(16), nullable=False, comment="提交人")
    reader = db.Column(db.Text, comment="已讀人員")
    time_consum = db.Column(db.String(8), comment="耗時: 單位 h")
    cooperator = db.Column(db.String(64), comment="合作人，用;隔開")


class TemporaryDutyApplyRecordModel(BaseModel):
    __tablename__ = "temporary_duty_apply_record_form"

    duty_id = db.Column(
        db.String(16),
        db.ForeignKey("temporary_duty_form.id"),
        nullable=False,
        comment="外鍵: temporary_duty_form",
    )
    apply_type = db.Column(db.String(32), nullable=False, comment="提交類型")
    submitter = db.Column(db.String(16), nullable=False, comment="提交人")
    reviewer = db.Column(
        db.String(256), nullable=False, comment="審核人，用';'進行分割"
    )
    status = db.Column(
        db.Integer, default=1, comment="狀態: 1--待處理，2--撤銷，3--同意，0--拒絕"
    )
    updated_at = db.Column(db.String(19), comment="更新時間")
    priority = db.Column(
        db.Integer, default=1, nullable=False, comment="優先級，1--正常；2--緊急"
    )


class PermissionModel(db.Model):
    __tablename__ = "permission_form"

    code = db.Column(
        db.Integer,
        nullable=False,
        primary_key=True,
        autoincrement=True,
        comment="主鍵，權限編碼",
    )
    name = db.Column(db.String(32), nullable=False, comment="權限名稱")
    remark = db.Column(db.String(256), comment="備註")
    created_at = db.Column(
        db.String(19), default=get_now, nullable=False, comment="創建時間"
    )
    review_data = db.relationship(
        "UserPermissionRelationalModel", backref="permission_form"
    )


class UserPermissionRelationalModel(BaseMaxinModel, BaseMixinModel):
    __tablename__ = "user_permission_relational_form"

    foreign_id = db.Column(
        db.String(16),
        nullable=False,
        comment="專案或者臨時任務ID",
    )
    type = db.Column(db.String(32), nullable=False, comment="專案或者臨時任務")
    work_no = db.Column(db.String(16), nullable=False, comment="用戶工號")
    permission_code = db.Column(
        db.Integer,
        db.ForeignKey("permission_form.code"),
        nullable=False,
        comment="外鍵: permission_form",
    )


class RoleModel(db.Model):
    __tablename__ = "role_form"

    code = db.Column(
        db.Integer,
        nullable=False,
        primary_key=True,
        autoincrement=True,
        comment="主鍵，角色編碼",
    )
    name = db.Column(db.String(32), nullable=False, comment="權限名稱")
    superior_code = db.Column(db.Integer, comment="上級角色編碼")
    created_at = db.Column(
        db.String(19), default=get_now, nullable=False, comment="創建時間"
    )
    review_data = db.relationship("UserRoleModel", backref="role_form")


class UserRoleModel(BaseMaxinModel):
    __tablename__ = "user_role_form"

    work_no = db.Column(db.String(16), nullable=False, comment="用戶工號")
    role_code = db.Column(
        db.Integer,
        db.ForeignKey("role_form.code"),
        nullable=False,
        comment="外鍵: role_form",
    )


class OperRecordModel(BaseModel):
    __tablename__ = "oper_record_form"

    operator = db.Column(db.String(16), nullable=False, comment="用戶工號")
    action = db.Column(db.String(32), nullable=False, comment="動作")
    matter = db.Column(db.Text, nullable=False, comment="操作事項")
    matter_id = db.Column(db.String(16), nullable=False, comment="事件ID")
    created_at = db.Column(
        db.String(19), default=get_now, nullable=False, comment="創建時間"
    )


class ReviewRecordModel(BaseModel):
    __tablename__ = "review_record_form"

    apply_id = db.Column(db.String(16), nullable=False, comment="申請ID")
    reviewer = db.Column(db.String(16), nullable=False, comment="審核人")
    result = db.Column(db.Integer, nullable=False, comment="審核結果")
    remark = db.Column(db.Text, comment="備註")


class ProjectGroupModel(BaseModel):
    __tablename__ = "project_group_form"

    id = db.Column(
        db.Integer, primary_key=True, autoincrement=True, comment="主鍵，自增"
    )
    group_name = db.Column(db.String(32), nullable=False, comment="組名")
