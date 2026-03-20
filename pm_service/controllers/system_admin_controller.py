# -*- coding: utf-8 -*-
"""系统管理员控制器"""
from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, ResourceExistsException, AuthenticationException
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    AdminUserModel, SystemConfigModel, OperationLogModel,
    UserProfileModel, FunctionDataModel, TemporaryDutyModel,
)


class SystemAdminController:

    # ── 登录 ───────────────────────────────────────────────────────────────────

    def login(self, username: str, password: str) -> dict | None:
        """管理员登录，若不是管理员账号返回 None"""
        from utils.auth import create_token
        admin = db.session.query(AdminUserModel).filter_by(username=username, status=1).first()
        if not admin:
            return None
        if admin.password != password:
            raise AuthenticationException(msg="密码错误")
        admin.last_login = CommonTools.get_now()
        db.session.commit()
        identity = {
            "empid": username,
            "username": admin.name,
            "is_admin": True,
            "role_code": "system_admin",
            "location": "",
        }
        access_token = create_token(identity=username, additional_claims=identity)
        return {
            "access_token": access_token,
            "work_no": username,
            "name": admin.name,
            "role_code": "system_admin",
            "role_name": "系统管理员",
            "is_admin": True,
            "is_supervisor": False,
        }

    # ── 仪表盘 ─────────────────────────────────────────────────────────────────

    def get_dashboard(self) -> dict:
        total_users    = db.session.query(UserProfileModel).filter_by(status=1).count()
        total_projects = db.session.query(FunctionDataModel).filter_by(status=1).count()
        total_duties   = db.session.query(TemporaryDutyModel).filter_by(status=1).count()
        total_admins   = db.session.query(AdminUserModel).filter_by(status=1).count()
        recent_logs    = (
            db.session.query(OperationLogModel)
            .order_by(OperationLogModel.created_at.desc())
            .limit(10).all()
        )
        return {
            "total_users":    total_users,
            "total_projects": total_projects,
            "total_duties":   total_duties,
            "total_admins":   total_admins,
            "recent_logs":    [l.to_dict() for l in recent_logs],
        }

    # ── 用户管理 ───────────────────────────────────────────────────────────────

    def list_users(self, page=1, size=20, keyword="", department="", status=None):
        q = db.session.query(UserProfileModel)
        if keyword:
            q = q.filter(db.or_(
                UserProfileModel.work_no.like(f"%{keyword}%"),
                UserProfileModel.name.like(f"%{keyword}%"),
            ))
        if department:
            q = q.filter(UserProfileModel.department == department)
        if status is not None:
            q = q.filter(UserProfileModel.status == status)
        total = q.count()
        users = q.order_by(UserProfileModel.created_at.desc()).offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page":  (total + size - 1) // size,
            "data_list":   [u.to_dict() for u in users],
        }

    def set_user_status(self, work_no: str, status: int):
        user = db.session.query(UserProfileModel).filter_by(work_no=work_no).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        user.status = status
        user.status_update_at = CommonTools.get_now()
        db.session.commit()

    def reset_password(self, work_no: str, new_password: str):
        user = db.session.query(UserProfileModel).filter_by(work_no=work_no, status=1).first()
        if not user:
            raise ResourceNotFoundException(resource_type="用户")
        user.password = new_password
        user.update_at = CommonTools.get_now()
        db.session.commit()

    # ── 系统配置 ───────────────────────────────────────────────────────────────

    def get_configs(self) -> list:
        rows = db.session.query(SystemConfigModel).order_by(SystemConfigModel.config_key).all()
        if not rows:
            defaults = [
                ("site_name",      "专案管理系统", "站点名称"),
                ("max_upload_mb",  "16",           "最大上传文件大小(MB)"),
                ("allow_register", "false",         "是否开放自助注册"),
                ("session_hours",  "8",             "登录会话有效时长(小时)"),
                ("notice_text",    "",              "系统公告文字"),
            ]
            for key, val, desc in defaults:
                db.session.add(SystemConfigModel(config_key=key, config_value=val, description=desc))
            db.session.commit()
            rows = db.session.query(SystemConfigModel).order_by(SystemConfigModel.config_key).all()
        return [r.to_dict() for r in rows]

    def batch_update_configs(self, configs: dict):
        for key, value in configs.items():
            row = db.session.query(SystemConfigModel).filter_by(config_key=key).first()
            if row:
                row.config_value = str(value)
                row.updated_at   = CommonTools.get_now()
        db.session.commit()

    # ── 操作日志 ───────────────────────────────────────────────────────────────

    def list_logs(self, page=1, size=20, work_no="", operation="", start_date="", end_date=""):
        q = db.session.query(OperationLogModel)
        if work_no:
            q = q.filter(OperationLogModel.work_no.like(f"%{work_no}%"))
        if operation:
            q = q.filter(OperationLogModel.operation.like(f"%{operation}%"))
        if start_date:
            q = q.filter(OperationLogModel.created_at >= start_date)
        if end_date:
            q = q.filter(OperationLogModel.created_at <= end_date + " 23:59:59")
        total = q.count()
        logs  = q.order_by(OperationLogModel.created_at.desc()).offset((page - 1) * size).limit(size).all()
        return {
            "total_count": total,
            "total_page":  (total + size - 1) // size,
            "data_list":   [l.to_dict() for l in logs],
        }

    # ── 管理员账号管理 ─────────────────────────────────────────────────────────

    def list_admins(self, page=1, size=20):
        total  = db.session.query(AdminUserModel).count()
        admins = (
            db.session.query(AdminUserModel)
            .order_by(AdminUserModel.created_at.desc())
            .offset((page - 1) * size).limit(size).all()
        )
        return {
            "total_count": total,
            "total_page":  (total + size - 1) // size,
            "data_list":   [a.to_dict() for a in admins],
        }

    def create_admin(self, username: str, password: str, name: str):
        if db.session.query(AdminUserModel).filter_by(username=username).first():
            raise ResourceExistsException(resource_type="管理员账号")
        admin = AdminUserModel(username=username, password=password, name=name)
        db.session.add(admin)
        db.session.commit()
        return admin.to_dict()

    def delete_admin(self, admin_id: str):
        admin = db.session.query(AdminUserModel).filter_by(id=admin_id).first()
        if not admin:
            raise ResourceNotFoundException(resource_type="管理员账号")
        db.session.delete(admin)
        db.session.commit()
