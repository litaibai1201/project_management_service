# -*- coding: utf-8 -*-
"""
@文件: system_controller.py
@说明: 系统管理控制器
"""
import json
from dbs.mysql_db import db
from tables.system_table import SystemModel
from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException
from daos.system_dao import SystemDAO

_dao = SystemDAO()


class SystemController:

    def list_systems(self, payload: dict):
        keyword   = payload.get("keyword", "")
        sys_group = payload.get("sys_group", "")
        page      = int(payload.get("page", 1))
        size      = int(payload.get("size", 50))

        q = _dao.query_active(keyword, sys_group)
        items, total = _dao.paginate(q, page, size)

        # 批量查维护人员名称
        all_nos: set[str] = set()
        for item in items:
            try:
                nos = json.loads(item.maintainers) if item.maintainers else []
                all_nos.update(nos)
            except Exception:
                pass
        name_map = _dao.name_map(all_nos)

        data = []
        for item in items:
            d = item.to_dict()
            d["maintainer_names"] = [
                {"work_no": wn, "name": name_map.get(wn.lower(), wn)}
                for wn in d["maintainers"]
            ]
            data.append(d)

        return {"data_list": data, "total_count": total, "page": page, "size": size}

    def get_system(self, system_id: str):
        s = _dao.find_active_by_id(system_id)
        if not s:
            raise ResourceNotFoundException(resource_type="系统")
        d = s.to_dict()
        name_map = _dao.name_map(set(d["maintainers"])) if d["maintainers"] else {}
        d["maintainer_names"] = [
            {"work_no": wn, "name": name_map.get(wn.lower(), wn)}
            for wn in d["maintainers"]
        ]
        return d

    def get_hours_summary(self, system_id: str):
        """系统工时汇总：按需求、任务、成员维度"""
        from tables.duty_table import TemporaryDutyModel, DutyProgressRecordModel
        from tables.standalone_req_table import StandaloneReqModel
        from tables.user_table import UserProfileModel

        duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.system_id == system_id,
            TemporaryDutyModel.duty_status != 9,
        ).all()
        duty_ids = [d.id for d in duties]
        if not duty_ids:
            return {"project_total_hours": 0, "project_overtime_hours": 0,
                    "requirements": [], "functions": [], "members": []}

        # 聚合工时（含合作人）
        from controllers.daily_log_controller import DailyLogController
        prog_recs = db.session.query(DutyProgressRecordModel).filter(
            DutyProgressRecordModel.duty_id.in_(duty_ids)).all()

        duty_map = {d.id: d for d in duties}
        duty_hours, duty_overtime, member_hours, member_overtime = \
            DailyLogController.compute_total_hours_with_cooperators(prog_recs, "duty")

        # 加上日志条目工时
        log_agg = DailyLogController.aggregate_log_hours("duty", duty_ids)
        for did, la in log_agg.items():
            duty_hours[did] = duty_hours.get(did, 0) + la.get("hours", 0)
            duty_overtime[did] = duty_overtime.get(did, 0) + la.get("overtime", 0)
        log_members = DailyLogController.aggregate_log_hours_by_member("duty", duty_ids)
        for wn, h, oh in log_members:
            member_hours[wn] = member_hours.get(wn, 0) + h
            member_overtime[wn] = member_overtime.get(wn, 0) + oh

        total = round(sum(duty_hours.values()), 1)
        total_ot = round(sum(duty_overtime.values()), 1)

        # 需求维度
        req_ids = list({d.standalone_req_id for d in duties if d.standalone_req_id})
        req_nm_map = {}
        if req_ids:
            reqs = db.session.query(StandaloneReqModel).filter(StandaloneReqModel.id.in_(req_ids)).all()
            req_nm_map = {r.id: r.req_nm for r in reqs}
        req_agg: dict = {}
        req_ot_agg: dict = {}
        for d in duties:
            rid = d.standalone_req_id or "__no_req__"
            req_agg[rid] = req_agg.get(rid, 0) + duty_hours.get(d.id, 0)
            req_ot_agg[rid] = req_ot_agg.get(rid, 0) + duty_overtime.get(d.id, 0)
        req_list = [{"req_id": rid if rid != "__no_req__" else "", "req_nm": req_nm_map.get(rid, ""),
                      "total_hours": round(h, 1), "overtime_hours": round(req_ot_agg.get(rid, 0), 1)}
                     for rid, h in sorted(req_agg.items(), key=lambda x: -x[1])]

        # 任务维度
        func_list = [{"func_id": d.id, "func_nm": d.duty_nm, "req_id": d.standalone_req_id or "",
                       "group1": d.group or "", "total_hours": round(duty_hours.get(d.id, 0), 1),
                       "overtime_hours": round(duty_overtime.get(d.id, 0), 1)}
                      for d in duties if duty_hours.get(d.id, 0) > 0]
        func_list.sort(key=lambda x: -x["total_hours"])

        # 成员维度
        work_nos = list(member_hours.keys())
        name_map = {}
        if work_nos:
            profiles = db.session.query(UserProfileModel).filter(
                db.func.lower(UserProfileModel.work_no).in_(work_nos)).all()
            name_map = {p.work_no.lower(): p.name for p in profiles}
        member_list = [{"work_no": wn, "name": name_map.get(wn, wn),
                         "total_hours": round(h, 1), "overtime_hours": round(member_overtime.get(wn, 0), 1)}
                        for wn, h in sorted(member_hours.items(), key=lambda x: -x[1])]

        return {"project_total_hours": total, "project_overtime_hours": total_ot,
                "requirements": req_list, "functions": func_list, "members": member_list}

    def get_report_stats(self):
        """按系统维度统计需求与任务数据（进度+延期）"""
        from datetime import date as _date
        from tables.standalone_req_table import StandaloneReqModel
        from tables.duty_table import TemporaryDutyModel

        systems = _dao.query_active().all()
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

            req_total       = len(sys_reqs)
            req_in_progress = sum(1 for r in sys_reqs if r.req_status != 4)
            req_completed   = sum(1 for r in sys_reqs if r.req_status == 4)
            req_completion_rate = round(req_completed / req_total * 100) if req_total > 0 else 0
            req_overdue = sum(1 for r in sys_reqs if r.req_status != 4 and r.expected_end_date and r.expected_end_date < today)

            task_total        = len(sys_duties)
            task_draft        = sum(1 for d in sys_duties if d.duty_status == 0)
            task_not_started  = sum(1 for d in sys_duties if d.duty_status == 6)
            task_in_progress  = sum(1 for d in sys_duties if d.duty_status == 1)
            task_completed    = sum(1 for d in sys_duties if d.duty_status == 3)
            task_shelved      = sum(1 for d in sys_duties if d.duty_status == 8)
            task_pending      = sum(1 for d in sys_duties if d.duty_status not in (3, 8))
            task_completion_rate = round(task_completed / task_total * 100) if task_total > 0 else 0
            task_overdue_incomplete = sum(1 for d in sys_duties if d.duty_status not in (3, 8) and d.expected_end_date and d.expected_end_date < today)
            task_overdue_complete = sum(1 for d in sys_duties if d.duty_status == 3 and d.expected_end_date and d.expected_end_date < today)
            task_overdue_rate = round(task_overdue_incomplete / task_pending * 100) if task_pending > 0 else 0

            result.append({
                "system_id": s.id, "sys_nm": s.sys_nm, "sys_group": s.sys_group or "",
                "req_total": req_total, "req_in_progress": req_in_progress,
                "req_completed": req_completed, "req_completion_rate": req_completion_rate,
                "req_overdue": req_overdue,
                "task_total": task_total, "task_draft": task_draft,
                "task_not_started": task_not_started, "task_in_progress": task_in_progress,
                "task_completed": task_completed, "task_shelved": task_shelved,
                "task_pending": task_pending, "task_completion_rate": task_completion_rate,
                "task_overdue_incomplete": task_overdue_incomplete,
                "task_overdue_complete": task_overdue_complete,
                "task_overdue_rate": task_overdue_rate,
            })
        return result

    def create_system(self, payload: dict):
        maintainers = payload.get("maintainers", [])
        if isinstance(maintainers, str):
            try: maintainers = json.loads(maintainers)
            except Exception: maintainers = []

        urls = payload.get("urls", [])
        if isinstance(urls, str):
            try: urls = json.loads(urls)
            except Exception: urls = []

        deploy_info = payload.get("deploy_info", [])
        if isinstance(deploy_info, str):
            try: deploy_info = json.loads(deploy_info)
            except Exception: deploy_info = []

        s = SystemModel(
            sys_nm=payload["sys_nm"],
            sys_group=payload.get("sys_group", ""),
            maintainers=json.dumps(maintainers, ensure_ascii=False),
            description=payload.get("description", ""),
            go_live_date=payload.get("go_live_date", ""),
            urls_json=json.dumps(urls, ensure_ascii=False),
            deploy_info_json=json.dumps(deploy_info, ensure_ascii=False),
        )
        _dao.add(s)
        _dao.commit()
        return s.to_dict()

    def update_system(self, system_id: str, payload: dict):
        s = _dao.find_active_by_id(system_id)
        if not s:
            raise ResourceNotFoundException(resource_type="系统")

        if "sys_nm" in payload: s.sys_nm = payload["sys_nm"]
        if "sys_group" in payload: s.sys_group = payload["sys_group"]
        if "description" in payload: s.description = payload["description"]
        if "go_live_date" in payload: s.go_live_date = payload["go_live_date"]
        if "maintainers" in payload:
            m = payload["maintainers"]
            if isinstance(m, str):
                try: m = json.loads(m)
                except Exception: m = []
            s.maintainers = json.dumps(m, ensure_ascii=False)
        if "urls" in payload:
            u = payload["urls"]
            if isinstance(u, str):
                try: u = json.loads(u)
                except Exception: u = []
            s.urls_json = json.dumps(u, ensure_ascii=False)
        if "deploy_info" in payload:
            di = payload["deploy_info"]
            if isinstance(di, str):
                try: di = json.loads(di)
                except Exception: di = []
            s.deploy_info_json = json.dumps(di, ensure_ascii=False)

        s.updated_at = CommonTools.get_now()
        _dao.commit()
        return s.to_dict()

    def delete_system(self, system_id: str):
        s = _dao.find_active_by_id(system_id)
        if not s:
            raise ResourceNotFoundException(resource_type="系统")
        s.sys_status = 9
        s.updated_at = CommonTools.get_now()
        _dao.commit()
        return True

    def list_groups(self):
        """获取所有系统分组（去重）"""
        return _dao.list_groups()
