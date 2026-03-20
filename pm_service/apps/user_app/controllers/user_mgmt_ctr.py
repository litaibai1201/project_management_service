# -*- coding: utf-8 -*-
"""
@文件: user_mgmt_ctr.py
@說明: 用戶管理 - 用戶 CRUD 控制器
@時間: 2024/03/06 00:00:00
@作者: LiDong
"""

from dbs.mysql_db import db
from dbs.mysql_db.model_tables import RoleModel, UserRoleModel
from apps.user_app.models import OperUserProfileModel
from common.common_tools import get_now


class UserMgmtController:
    def __init__(self):
        self.oupm = OperUserProfileModel()

    def _user_to_dict(self, user_obj) -> dict:
        """將 ORM 對象轉為字典"""
        if user_obj is None:
            return {}
        return {
            "work_no":    user_obj.work_no,
            "name":       user_obj.name,
            "department": user_obj.department,
            "position":   user_obj.position,
            "email":      user_obj.email,
            "phone":      user_obj.phone,
            "remark":     user_obj.remark,
            "status":     user_obj.status,
            "created_at": user_obj.created_at,
            "updated_at": user_obj.updated_at,
        }

    def create_user(self, payload: dict):
        """
        新增用戶
        :return: (result | msg, flag)
        """
        work_no = payload.get("work_no", "").strip()
        if not work_no:
            return "工號不能為空", False

        if self.oupm.check_work_no_exists(work_no):
            return "該工號已存在，請勿重複新增", False

        data = {
            "work_no":    work_no,
            "name":       payload.get("name", "").strip(),
            "department": payload.get("department"),
            "position":   payload.get("position"),
            "email":      payload.get("email"),
            "phone":      payload.get("phone"),
            "remark":     payload.get("remark"),
            "status":     1,
        }
        _, flag = self.oupm.add_user(data)
        if not flag:
            return "新增用戶失敗，請稍後重試", False
        return {"work_no": work_no}, True

    def get_user(self, work_no: str):
        """
        查詢單個用戶
        :return: (user_dict | msg, flag)
        """
        user = self.oupm.query_user_by_work_no(work_no)
        if not user:
            return "用戶不存在", False
        return self._user_to_dict(user), True

    def _get_roles_map(self, work_nos: list) -> dict:
        """批量查詢工號對應的角色，返回 {work_no: {role_code, role_name}} 映射"""
        if not work_nos:
            return {}
        rows = (
            db.session.query(UserRoleModel.work_no, RoleModel.code, RoleModel.name)
            .join(RoleModel, UserRoleModel.role_code == RoleModel.code)
            .filter(UserRoleModel.work_no.in_(work_nos), UserRoleModel.status == 1)
            .all()
        )
        return {r.work_no: {"role_code": r.code, "role_name": r.name} for r in rows}

    def get_users(self, payload: dict):
        """
        查詢用戶列表（分頁 + 搜尋 + 部門過濾）
        :return: dict { list, total, page, size, total_page }
        """
        page       = payload.get("page", 1)
        size       = payload.get("size", 20)
        keyword    = payload.get("keyword", "")
        department = payload.get("department", "")

        users, total = self.oupm.query_users(page, size, keyword, department)
        total_page = (total + size - 1) // size

        work_nos   = [u.work_no for u in users]
        roles_map  = self._get_roles_map(work_nos)

        def user_dict(u):
            d = self._user_to_dict(u)
            role = roles_map.get(u.work_no, {})
            d["role_code"] = role.get("role_code")
            d["role_name"] = role.get("role_name")
            return d

        return {
            "list":       [user_dict(u) for u in users],
            "total":      total,
            "page":       page,
            "size":       size,
            "total_page": total_page,
        }

    def update_user(self, work_no: str, payload: dict):
        """
        更新用戶資料（只更新傳入的非空欄位）
        :return: (msg, flag)
        """
        user = self.oupm.query_user_by_work_no(work_no)
        if not user:
            return "用戶不存在", False

        update_dict = {
            k: v for k, v in payload.items()
            if v is not None and k in ("name", "department", "position", "email", "phone", "remark")
        }
        if not update_dict:
            return "無可更新的欄位", False

        _, flag = self.oupm.update_user(work_no, update_dict)
        if not flag:
            return "更新失敗，請稍後重試", False
        return "更新成功", True

    def delete_user(self, work_no: str):
        """
        軟刪除用戶
        :return: (msg, flag)
        """
        user = self.oupm.query_user_by_work_no(work_no)
        if not user:
            return "用戶不存在或已被刪除", False

        _, flag = self.oupm.soft_delete_user(work_no)
        if not flag:
            return "刪除失敗，請稍後重試", False
        return "刪除成功", True

    def get_departments(self):
        """獲取所有部門清單"""
        return self.oupm.query_all_departments()
