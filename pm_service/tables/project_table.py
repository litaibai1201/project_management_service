# -*- coding: utf-8 -*-
"""
@文件: project_table.py
@说明: 项目管理相关数据表
"""
from utils.tools import CommonTools
from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


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
    region   = db.Column(db.String(64), comment="地区")
    campus   = db.Column(db.String(64), comment="园区")
    process  = db.Column(db.String(64), comment="制程")
    factory  = db.Column(db.String(64), comment="厂区")

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
            "region": self.region or "", "campus": self.campus or "",
            "process": self.process or "", "factory": self.factory or "",
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
