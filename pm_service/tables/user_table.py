# -*- coding: utf-8 -*-
"""
@文件: user_table.py
@说明: 用户与权限相关数据表
"""
from utils.tools import CommonTools
from dbs.mysql_db import db
from .base_table import BaseMixinModel, generate_uuid


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
