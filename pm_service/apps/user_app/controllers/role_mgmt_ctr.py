# -*- coding: utf-8 -*-
"""
@文件: role_mgmt_ctr.py
@說明: 角色管理 + 用戶角色分配
@作者: LiDong
"""

from dbs.mysql_db import db
from dbs.mysql_db.model_tables import RoleModel, UserRoleModel
from common.common_tools import get_now, get_timestamp


class RoleMgmtController:
    """角色 CRUD"""

    def _role_to_dict(self, role) -> dict:
        return {
            "code":          role.code,
            "name":          role.name,
            "superior_code": role.superior_code,
            "created_at":    role.created_at,
        }

    def list_roles(self) -> list:
        roles = db.session.query(RoleModel).order_by(RoleModel.code).all()
        return [self._role_to_dict(r) for r in roles]

    def create_role(self, payload: dict):
        name = payload.get("name", "").strip()
        if not name:
            return "角色名稱不能為空", False
        exists = db.session.query(RoleModel).filter_by(name=name).first()
        if exists:
            return "角色名稱已存在", False
        role = RoleModel(
            name=name,
            superior_code=payload.get("superior_code"),
        )
        try:
            db.session.add(role)
            db.session.commit()
            return self._role_to_dict(role), True
        except Exception as e:
            db.session.rollback()
            return f"新增失敗: {e}", False

    def update_role(self, code: int, payload: dict):
        role = db.session.query(RoleModel).filter_by(code=code).first()
        if not role:
            return "角色不存在", False
        name = payload.get("name", "").strip()
        if name:
            dup = db.session.query(RoleModel).filter(
                RoleModel.name == name, RoleModel.code != code
            ).first()
            if dup:
                return "角色名稱已存在", False
            role.name = name
        if "superior_code" in payload:
            role.superior_code = payload["superior_code"]
        try:
            db.session.commit()
            return self._role_to_dict(role), True
        except Exception as e:
            db.session.rollback()
            return f"更新失敗: {e}", False

    def delete_role(self, code: int):
        role = db.session.query(RoleModel).filter_by(code=code).first()
        if not role:
            return "角色不存在", False
        # 檢查是否有用戶正在使用此角色
        in_use = db.session.query(UserRoleModel).filter_by(
            role_code=code, status=1
        ).first()
        if in_use:
            return "此角色尚有用戶在使用，無法刪除", False
        try:
            db.session.delete(role)
            db.session.commit()
            return "刪除成功", True
        except Exception as e:
            db.session.rollback()
            return f"刪除失敗: {e}", False


class UserRoleMgmtController:
    """用戶角色分配"""

    def get_user_role(self, work_no: str) -> dict | None:
        """查詢用戶當前角色"""
        result = (
            db.session.query(UserRoleModel, RoleModel)
            .join(RoleModel, UserRoleModel.role_code == RoleModel.code)
            .filter(UserRoleModel.work_no == work_no, UserRoleModel.status == 1)
            .first()
        )
        if not result:
            return None
        _, role = result
        return {"role_code": role.code, "role_name": role.name}

    def assign_role(self, work_no: str, role_code: int):
        """給用戶分配角色（自動移除舊角色）"""
        role = db.session.query(RoleModel).filter_by(code=role_code).first()
        if not role:
            return "角色不存在", False
        try:
            # 軟刪除舊角色記錄
            db.session.query(UserRoleModel).filter_by(
                work_no=work_no, status=1
            ).update({"status": 0, "status_update_at": get_now()})
            # 新增分配記錄
            record = UserRoleModel(
                id=get_timestamp(),
                work_no=work_no,
                role_code=role_code,
                status=1,
            )
            db.session.add(record)
            db.session.commit()
            return {"role_code": role.code, "role_name": role.name}, True
        except Exception as e:
            db.session.rollback()
            return f"分配失敗: {e}", False

    def remove_role(self, work_no: str):
        """移除用戶角色"""
        try:
            updated = db.session.query(UserRoleModel).filter_by(
                work_no=work_no, status=1
            ).update({"status": 0, "status_update_at": get_now()})
            db.session.commit()
            if updated == 0:
                return "該用戶無角色可移除", False
            return "移除成功", True
        except Exception as e:
            db.session.rollback()
            return f"移除失敗: {e}", False
