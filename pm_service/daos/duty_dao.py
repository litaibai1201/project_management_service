# -*- coding: utf-8 -*-
"""
@文件: duty_dao.py
@说明: AR任务 DAO
"""
from dbs.mysql_db import db
from tables.duty_table import TemporaryDutyModel, DutyProgressRecordModel
from tables.user_table import UserProfileModel, HierarchyModel
from tables.system_table import SystemModel
from tables.standalone_req_table import StandaloneReqModel
from tables.review_table import ReviewApplyModel
from .base_dao import BaseDAO


class DutyDAO(BaseDAO):
    model = TemporaryDutyModel

    # ── 单条查询 ──────────────────────────────────────────────────

    def find_active_by_id(self, duty_id: str):
        """查找未删除的AR任务"""
        d = db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()
        if d and d.duty_status == 9:
            return None
        return d

    def find_by_id(self, duty_id: str):
        """查找AR任务（含已删除）"""
        return db.session.query(TemporaryDutyModel).filter_by(id=duty_id).first()

    # ── 列表 / 筛选查询 ──────────────────────────────────────────

    def build_list_query(self, payload: dict, work_no: str = None):
        """构建AR列表查询（返回 query 对象，供 controller 做分页）"""
        from sqlalchemy import or_

        keyword = payload.get("keyword", "")
        status = payload.get("status")
        priority = payload.get("priority")
        responsible = payload.get("responsible", "")
        scope = payload.get("scope", "")
        standalone_req_id = payload.get("standalone_req_id")
        system_id = payload.get("system_id")

        q = db.session.query(TemporaryDutyModel).filter(TemporaryDutyModel.duty_status != 9)

        if scope and work_no:
            if scope == 'mine':
                q = q.filter(or_(
                    TemporaryDutyModel.standalone_req_id.isnot(None),
                    TemporaryDutyModel.creator == work_no,
                    TemporaryDutyModel.responsible.like(f'%"{work_no}"%'),
                ))
            elif scope == 'supervisor':
                subordinates = self.get_subordinates(work_no)
                all_nos = [work_no] + subordinates
                creator_filters = [TemporaryDutyModel.creator == no for no in all_nos]
                resp_filters = [TemporaryDutyModel.responsible.like(f'%"{no}"%') for no in all_nos]
                q = q.filter(or_(
                    TemporaryDutyModel.standalone_req_id.isnot(None),
                    *creator_filters,
                    *resp_filters,
                ))

        if keyword:
            q = q.filter(TemporaryDutyModel.duty_nm.like(f"%{keyword}%"))
        if status is not None:
            q = q.filter(TemporaryDutyModel.duty_status == status)
        if priority is not None:
            q = q.filter(TemporaryDutyModel.priority == priority)
        if responsible:
            q = q.filter(TemporaryDutyModel.responsible.like(f"%{responsible}%"))
        if standalone_req_id:
            q = q.filter(TemporaryDutyModel.standalone_req_id == standalone_req_id)
        if system_id:
            q = q.filter(TemporaryDutyModel.system_id == system_id)

        return q

    def query_task_list(self, work_no: str):
        """查询用户负责的活跃任务"""
        return (
            db.session.query(TemporaryDutyModel)
            .filter(
                TemporaryDutyModel.responsible.like(f"%{work_no}%"),
                TemporaryDutyModel.duty_status.in_([0, 1, 6]),
            )
        )

    def query_duties_by_req(self, standalone_req_id: str):
        """查询某需求下所有未删除的任务"""
        return db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.standalone_req_id == standalone_req_id,
            TemporaryDutyModel.duty_status != 9,
        ).all()

    def find_draft_duties_by_ids(self, duty_ids: list):
        """查询指定 ID 列表中状态为草稿的任务"""
        return db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.id.in_(duty_ids),
            TemporaryDutyModel.duty_status == 0,
        ).all()

    # ── 关联数据查询 ──────────────────────────────────────────────

    def get_subordinates(self, work_no: str) -> list:
        """获取下属工号列表"""
        rows = db.session.query(HierarchyModel.subordinate_work_no).filter(
            HierarchyModel.supervisor_work_no == work_no,
        ).all()
        return [r[0] for r in rows]

    def get_system_name_map(self, sys_ids: list) -> dict:
        """批量获取系统名称映射 {id: sys_nm}"""
        if not sys_ids:
            return {}
        rows = db.session.query(SystemModel.id, SystemModel.sys_nm).filter(
            SystemModel.id.in_(sys_ids)
        ).all()
        return {s.id: s.sys_nm for s in rows}

    def get_req_name_map(self, req_ids: list) -> dict:
        """批量获取需求名称映射 {id: req_nm}"""
        if not req_ids:
            return {}
        rows = db.session.query(StandaloneReqModel.id, StandaloneReqModel.req_nm).filter(
            StandaloneReqModel.id.in_(req_ids)
        ).all()
        return {r.id: r.req_nm for r in rows}

    def get_system_by_id(self, system_id: str):
        """查找单个系统"""
        if not system_id:
            return None
        return db.session.query(SystemModel).filter_by(id=system_id).first()

    def get_system_name(self, system_id: str) -> str:
        """获取系统名称"""
        if not system_id:
            return ""
        row = db.session.query(SystemModel.sys_nm).filter_by(id=system_id).first()
        return row.sys_nm if row else ""

    def get_req_by_id(self, req_id: str):
        """查找独立需求"""
        if not req_id:
            return None
        return db.session.query(StandaloneReqModel).filter_by(id=req_id).first()

    # ── 用户查询 ──────────────────────────────────────────────────

    def get_user_profile(self, work_no: str):
        """按工号查找用户（大小写不敏感）"""
        return db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no) == (work_no or "").lower()
        ).first()

    def get_user_display_name(self, work_no: str) -> str:
        """获取用户显示名"""
        u = self.get_user_profile(work_no)
        return u.name if u else work_no

    def batch_get_user_map(self, work_nos: list) -> dict:
        """批量获取用户 {work_no_lower: UserProfileModel}"""
        if not work_nos:
            return {}
        users = db.session.query(UserProfileModel).filter(
            db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in work_nos])
        ).all()
        return {u.work_no.lower(): u for u in users}

    # ── 进度记录查询 ──────────────────────────────────────────────

    def query_progress(self, duty_id: str):
        """构建进度记录查询"""
        return db.session.query(DutyProgressRecordModel).filter_by(duty_id=duty_id)

    def count_unread_progress(self, work_no: str) -> int:
        """统计某建立人的未读进度数"""
        return (
            db.session.query(DutyProgressRecordModel)
            .join(TemporaryDutyModel, DutyProgressRecordModel.duty_id == TemporaryDutyModel.id)
            .filter(
                TemporaryDutyModel.creator == work_no,
                DutyProgressRecordModel.is_read == 0,
            ).count()
        )

    # ── 审核记录查询 ──────────────────────────────────────────────

    def find_review_by_id(self, review_id: str):
        """查找审核记录"""
        return db.session.query(ReviewApplyModel).filter_by(id=review_id).first()

    def query_duty_reviews(self, work_no: str = None):
        """构建AR相关审核列表查询"""
        from sqlalchemy import or_
        q = db.session.query(ReviewApplyModel).filter(ReviewApplyModel.duty_id.isnot(None))
        if work_no:
            q = q.filter(or_(
                ReviewApplyModel.reviewer.like(f"%{work_no}%"),
                ReviewApplyModel.approval_nodes_json.like(f"%{work_no}%"),
            ))
        return q

    # ── 写入辅助 ──────────────────────────────────────────────────

    def add_and_commit(self, instance):
        """添加并提交"""
        db.session.add(instance)
        db.session.commit()

    def enrich_duty_list(self, duties: list) -> list:
        """为AR列表项补充 system_nm / requirement_nm"""
        sys_ids = list({d.system_id for d in duties if d.system_id})
        sys_map = self.get_system_name_map(sys_ids)
        req_ids = list({d.standalone_req_id for d in duties if d.standalone_req_id})
        req_nm_map = self.get_req_name_map(req_ids)
        result = []
        for d in duties:
            r = d.to_dict()
            r['system_nm'] = sys_map.get(d.system_id, '') if d.system_id else ''
            r['requirement_nm'] = req_nm_map.get(d.standalone_req_id, '') if d.standalone_req_id else ''
            result.append(r)
        return result
