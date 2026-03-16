# -*- coding: utf-8 -*-
"""
@文件: hierarchy_ctr.py
@說明: 用戶管理 - 層級關係控制器
@時間: 2024/03/06 00:00:00
@作者: LiDong
"""

from apps.user_app.models import OperUserHierarchyModel, OperUserProfileModel


class HierarchyController:
    def __init__(self):
        self.ouhm = OperUserHierarchyModel()
        self.oupm = OperUserProfileModel()

    def _profile_to_dict(self, user_obj) -> dict:
        """將 UserProfileModel ORM 對象轉為簡要字典"""
        if user_obj is None:
            return {}
        return {
            "work_no":    user_obj.work_no,
            "name":       user_obj.name,
            "department": user_obj.department,
            "position":   user_obj.position,
        }

    def set_relation(self, payload: dict):
        """
        設定主管-下屬關係
        :return: (result | msg, flag)
        """
        supervisor_work_no  = payload.get("supervisor_work_no", "").strip()
        subordinate_work_no = payload.get("subordinate_work_no", "").strip()
        remark              = payload.get("remark", "")

        if supervisor_work_no == subordinate_work_no:
            return "主管與下屬不能是同一人", False

        # 確認兩位用戶都存在
        if not self.oupm.query_user_by_work_no(supervisor_work_no):
            return f"主管工號 {supervisor_work_no} 不存在，請先新增用戶", False
        if not self.oupm.query_user_by_work_no(subordinate_work_no):
            return f"下屬工號 {subordinate_work_no} 不存在，請先新增用戶", False

        # 防止重複建立相同關係
        if self.ouhm.check_relation_exists(supervisor_work_no, subordinate_work_no):
            return "該主管-下屬關係已存在", False

        # 防止循環依賴：下屬不能是主管的（直接或間接）主管
        all_supervisors_of_supervisor = self.ouhm.get_all_supervisors(supervisor_work_no)
        if subordinate_work_no in all_supervisors_of_supervisor:
            return "設定失敗：循環層級關係，下屬已是該主管的上級", False

        _, flag = self.ouhm.add_relation(supervisor_work_no, subordinate_work_no, remark)
        if not flag:
            return "新增層級關係失敗，請稍後重試", False
        return {"supervisor_work_no": supervisor_work_no, "subordinate_work_no": subordinate_work_no}, True

    def remove_relation(self, relation_id: str):
        """
        刪除層級關係
        :return: (msg, flag)
        """
        relation = self.ouhm.get_relation_by_id(relation_id)
        if not relation:
            return "層級關係不存在", False

        _, flag = self.ouhm.delete_relation(relation_id)
        if not flag:
            return "刪除失敗，請稍後重試", False
        return "刪除成功", True

    def get_subordinates(self, work_no: str, all_levels: bool = False):
        """
        獲取下屬列表
        :param all_levels: True = 返回所有層級下屬（含間接）; False = 只返回直屬
        :return: (users, flag, msg)
        """
        if not self.oupm.query_user_by_work_no(work_no):
            return None, False, "用戶不存在"

        if all_levels:
            sub_work_nos = self.ouhm.get_all_subordinates(work_no)
            users = [
                self._profile_to_dict(self.oupm.query_user_by_work_no(wn))
                for wn in sub_work_nos
                if self.oupm.query_user_by_work_no(wn)
            ]
        else:
            rows = self.ouhm.get_direct_subordinates(work_no)
            users = []
            for row in rows:
                sub_wn = row[1]
                user = self.oupm.query_user_by_work_no(sub_wn)
                if user:
                    d = self._profile_to_dict(user)
                    d["relation_id"] = row[0]
                    d["remark"]      = row[2]
                    d["created_at"]  = row[3]
                    users.append(d)

        return users, True, ""

    def get_supervisors(self, work_no: str):
        """
        獲取直屬主管列表
        :return: (users, flag, msg)
        """
        if not self.oupm.query_user_by_work_no(work_no):
            return None, False, "用戶不存在"

        rows = self.ouhm.get_direct_supervisors(work_no)
        users = []
        for row in rows:
            sup_wn = row[1]
            user = self.oupm.query_user_by_work_no(sup_wn)
            if user:
                d = self._profile_to_dict(user)
                d["relation_id"] = row[0]
                d["remark"]      = row[2]
                d["created_at"]  = row[3]
                users.append(d)

        return users, True, ""

    def check_view_permission(self, requester: str, target: str) -> bool:
        """
        判斷 requester 是否有權查看 target 的更新內容。
        規則：
          1. 查看自己 -> 允許
          2. requester 是 target 的直接或多級主管 -> 允許
          3. 其他 -> 不允許
        """
        if requester == target:
            return True
        return self.ouhm.is_supervisor_of(requester, target)

    def get_team_tree(self, work_no: str, max_depth: int = 5) -> dict:
        """
        遞歸構建以 work_no 為根的完整層級樹
        :return: 樹形結構 dict
        """
        user = self.oupm.query_user_by_work_no(work_no)
        if not user:
            return {}

        visited = set()

        def _build_node(wn: str, depth: int) -> dict:
            if depth > max_depth or wn in visited:
                return {}
            visited.add(wn)
            u = self.oupm.query_user_by_work_no(wn)
            if not u:
                return {}
            node = self._profile_to_dict(u)
            rows = self.ouhm.get_direct_subordinates(wn)
            node["subordinates"] = [
                _build_node(r[1], depth + 1)
                for r in rows
                if r[1] not in visited
            ]
            return node

        return _build_node(work_no, 0)
