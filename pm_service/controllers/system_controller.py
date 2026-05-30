# -*- coding: utf-8 -*-
"""系统管理控制器"""
import json
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import SystemModel, UserProfileModel
from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException


class SystemController:

    def list_systems(self, payload: dict):
        keyword   = payload.get("keyword", "")
        sys_group = payload.get("sys_group", "")
        page      = int(payload.get("page", 1))
        size      = int(payload.get("size", 50))

        q = db.session.query(SystemModel).filter(SystemModel.sys_status != 9)
        if keyword:
            q = q.filter(SystemModel.sys_nm.like(f"%{keyword}%"))
        if sys_group:
            q = q.filter(SystemModel.sys_group == sys_group)

        total = q.count()
        items = q.order_by(SystemModel.sys_nm.asc()).offset((page - 1) * size).limit(size).all()

        # 批量查维护人员名称
        all_nos: set[str] = set()
        for item in items:
            try:
                nos = json.loads(item.maintainers) if item.maintainers else []
                all_nos.update(nos)
            except Exception:
                pass
        name_map: dict[str, str] = {}
        if all_nos:
            users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
                UserProfileModel.work_no.in_(all_nos)
            ).all()
            name_map = {u.work_no: u.name for u in users}

        data = []
        for item in items:
            d = item.to_dict()
            d["maintainer_names"] = [
                {"work_no": wn, "name": name_map.get(wn, wn)}
                for wn in d["maintainers"]
            ]
            data.append(d)

        return {"data_list": data, "total_count": total, "page": page, "size": size}

    def get_system(self, system_id: str):
        s = db.session.query(SystemModel).filter_by(id=system_id).first()
        if not s or s.sys_status == 9:
            raise ResourceNotFoundException(resource_type="系统")
        d = s.to_dict()
        # 查维护人员名称
        name_map: dict[str, str] = {}
        if d["maintainers"]:
            users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
                UserProfileModel.work_no.in_(d["maintainers"])
            ).all()
            name_map = {u.work_no: u.name for u in users}
        d["maintainer_names"] = [
            {"work_no": wn, "name": name_map.get(wn, wn)}
            for wn in d["maintainers"]
        ]
        return d

    def get_report_stats(self):
        """按系统维度统计需求与任务数据（进度+延期）"""
        from datetime import date as _date
        from dbs.mysql_db.model_tables import StandaloneReqModel, TemporaryDutyModel

        systems = db.session.query(SystemModel).filter(SystemModel.sys_status != 9).order_by(SystemModel.sys_nm.asc()).all()
        system_ids = [s.id for s in systems]
        today = str(_date.today())

        reqs = db.session.query(StandaloneReqModel).filter(
            StandaloneReqModel.system_id.in_(system_ids),
            StandaloneReqModel.req_status != 9,
        ).all()

        duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.system_id.in_(system_ids),
            TemporaryDutyModel.duty_status != 9,
        ).all()

        req_by_sys: dict = {}
        for r in reqs:
            req_by_sys.setdefault(r.system_id, []).append(r)

        duty_by_sys: dict = {}
        for d in duties:
            if d.system_id:
                duty_by_sys.setdefault(d.system_id, []).append(d)

        result = []
        for s in systems:
            sys_reqs   = req_by_sys.get(s.id, [])
            sys_duties = duty_by_sys.get(s.id, [])

            # ── 需求统计 ─────────────────────────────────────────────────────
            # 除已完結(4)外，其余所有状态均视为"进行中"
            req_total       = len(sys_reqs)
            req_in_progress = sum(1 for r in sys_reqs if r.req_status != 4)
            req_completed   = sum(1 for r in sys_reqs if r.req_status == 4)
            req_completion_rate = round(req_completed / req_total * 100) if req_total > 0 else 0
            # 进行中需求中已超期的（有截止日且已过期）
            req_overdue = sum(
                1 for r in sys_reqs
                if r.req_status != 4 and r.expected_end_date and r.expected_end_date < today
            )

            # ── 任务统计 ─────────────────────────────────────────────────────
            # 草稿(0) 单独计算；进行中(1)；完結審核(2)/審核中(5)/未開始(6) 单独计算
            # 已完結(3)；搁置(8)
            task_total        = len(sys_duties)
            task_draft        = sum(1 for d in sys_duties if d.duty_status == 0)
            task_not_started  = sum(1 for d in sys_duties if d.duty_status == 6)
            task_in_progress  = sum(1 for d in sys_duties if d.duty_status == 1)
            task_completed    = sum(1 for d in sys_duties if d.duty_status == 3)
            task_shelved      = sum(1 for d in sys_duties if d.duty_status == 8)
            # 待处理：所有未完成/未删除/未搁置的任务（含草稿/进行中/审核中/未开始等）
            task_pending      = sum(1 for d in sys_duties if d.duty_status not in (3, 8))
            task_completion_rate = round(task_completed / task_total * 100) if task_total > 0 else 0
            # 延期：未完成/未搁置任务中已超期的
            task_overdue_incomplete = sum(
                1 for d in sys_duties
                if d.duty_status not in (3, 8) and d.expected_end_date and d.expected_end_date < today
            )
            # 延期已完成：已完結但超过截止日的
            task_overdue_complete = sum(
                1 for d in sys_duties
                if d.duty_status == 3 and d.expected_end_date and d.expected_end_date < today
            )
            task_overdue_rate = round(task_overdue_incomplete / task_pending * 100) if task_pending > 0 else 0

            result.append({
                "system_id":   s.id,
                "sys_nm":      s.sys_nm,
                "sys_group":   s.sys_group or "",
                # 需求
                "req_total":          req_total,
                "req_in_progress":    req_in_progress,
                "req_completed":      req_completed,
                "req_completion_rate": req_completion_rate,
                "req_overdue":        req_overdue,
                # 任务
                "task_total":               task_total,
                "task_draft":               task_draft,
                "task_not_started":         task_not_started,
                "task_in_progress":         task_in_progress,
                "task_completed":           task_completed,
                "task_shelved":             task_shelved,
                "task_pending":             task_pending,
                "task_completion_rate":     task_completion_rate,
                "task_overdue_incomplete":  task_overdue_incomplete,
                "task_overdue_complete":    task_overdue_complete,
                "task_overdue_rate":        task_overdue_rate,
            })
        return result

    def create_system(self, payload: dict):
        maintainers = payload.get("maintainers", [])
        if isinstance(maintainers, str):
            try:
                maintainers = json.loads(maintainers)
            except Exception:
                maintainers = []

        urls = payload.get("urls", [])
        if isinstance(urls, str):
            try:
                urls = json.loads(urls)
            except Exception:
                urls = []

        deploy_info = payload.get("deploy_info", [])
        if isinstance(deploy_info, str):
            try:
                deploy_info = json.loads(deploy_info)
            except Exception:
                deploy_info = []

        s = SystemModel(
            sys_nm=payload["sys_nm"],
            sys_group=payload.get("sys_group", ""),
            maintainers=json.dumps(maintainers, ensure_ascii=False),
            description=payload.get("description", ""),
            go_live_date=payload.get("go_live_date", ""),
            urls_json=json.dumps(urls, ensure_ascii=False),
            deploy_info_json=json.dumps(deploy_info, ensure_ascii=False),
        )
        db.session.add(s)
        db.session.commit()
        return s.to_dict()

    def update_system(self, system_id: str, payload: dict):
        s = db.session.query(SystemModel).filter_by(id=system_id).first()
        if not s or s.sys_status == 9:
            raise ResourceNotFoundException(resource_type="系统")

        if "sys_nm" in payload:
            s.sys_nm = payload["sys_nm"]
        if "sys_group" in payload:
            s.sys_group = payload["sys_group"]
        if "description" in payload:
            s.description = payload["description"]
        if "go_live_date" in payload:
            s.go_live_date = payload["go_live_date"]
        if "maintainers" in payload:
            m = payload["maintainers"]
            if isinstance(m, str):
                try:
                    m = json.loads(m)
                except Exception:
                    m = []
            s.maintainers = json.dumps(m, ensure_ascii=False)
        if "urls" in payload:
            u = payload["urls"]
            if isinstance(u, str):
                try:
                    u = json.loads(u)
                except Exception:
                    u = []
            s.urls_json = json.dumps(u, ensure_ascii=False)
        if "deploy_info" in payload:
            di = payload["deploy_info"]
            if isinstance(di, str):
                try:
                    di = json.loads(di)
                except Exception:
                    di = []
            s.deploy_info_json = json.dumps(di, ensure_ascii=False)

        s.updated_at = CommonTools.get_now()
        db.session.commit()
        return s.to_dict()

    def delete_system(self, system_id: str):
        s = db.session.query(SystemModel).filter_by(id=system_id).first()
        if not s or s.sys_status == 9:
            raise ResourceNotFoundException(resource_type="系统")
        s.sys_status = 9
        s.updated_at = CommonTools.get_now()
        db.session.commit()
        return True

    def list_groups(self):
        """获取所有系统分组（去重）"""
        rows = db.session.query(SystemModel.sys_group).filter(
            SystemModel.sys_status != 9,
            SystemModel.sys_group.isnot(None),
            SystemModel.sys_group != "",
        ).distinct().all()
        return [r[0] for r in rows]
