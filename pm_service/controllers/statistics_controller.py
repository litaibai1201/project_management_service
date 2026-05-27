# -*- coding: utf-8 -*-
"""统计控制器"""
import json
from datetime import datetime, timedelta
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    UserProfileModel, FunctionDataModel, TemporaryDutyModel,
    ProgressRecordDataModel, DutyProgressRecordModel,
)


class StatisticsController:

    def get_member_stats(self, work_no: str, start_date: str = None, end_date: str = None):
        """
        获取当前用户下属的工作统计。
        优先查层级关系（HierarchyModel），若无下属则回退查所有活跃成员。
        返回字段与前端 MemberWorkStat 对应：
          work_no, name, total_hours,
          completed_tasks, overdue_tasks, overdue_days,
          in_progress_tasks, weekly_hours
        """
        from controllers.user_controller import UserController
        user_ctrl = UserController()
        subordinates = user_ctrl.get_subordinates(work_no, all_levels=True)
        sub_work_nos = [s["work_no"] for s in subordinates]

        if sub_work_nos:
            users = (
                db.session.query(UserProfileModel)
                .filter(UserProfileModel.work_no.in_(sub_work_nos), UserProfileModel.status == 1)
                .all()
            )
        else:
            # 没有配置层级关系时，回退查询所有活跃成员（排除自身）
            users = (
                db.session.query(UserProfileModel)
                .filter(UserProfileModel.status == 1, UserProfileModel.work_no != work_no)
                .all()
            )

        member_work_nos = {u.work_no for u in users}

        members = []
        for user in users:
            stat = self._build_member_stat(user, start_date, end_date)
            members.append(stat)

        # ── 团队汇总（按任务ID去重，不重复计数） ─────────────────────────
        summary = self._build_team_summary(member_work_nos)

        return {"members": members, "summary": summary}

    def _build_team_summary(self, member_work_nos: set) -> dict:
        """按任务 ID 去重统计团队整体的完成/进行中/超时任务数"""
        today = datetime.today().date()
        completed = set()
        in_progress = set()
        overdue = set()

        # 功能任务
        all_funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.status == 1,
        ).all()
        for f in all_funcs:
            resp = json.loads(f.responsible) if f.responsible else []
            if not any(w in member_work_nos for w in resp):
                continue
            s = f.function_status or 0
            if s == 4:
                completed.add(('func', f.id))
            elif s in (1, 2, 3):
                in_progress.add(('func', f.id))
                end = f.expected_end_date
                if end:
                    try:
                        if datetime.strptime(end, "%Y-%m-%d").date() < today:
                            overdue.add(('func', f.id))
                    except ValueError:
                        pass

        # 临时任务
        all_duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.status == 1,
        ).all()
        for d in all_duties:
            resp = json.loads(d.responsible) if d.responsible else []
            if not any(w in member_work_nos for w in resp):
                continue
            s = d.duty_status or 0
            if s == 4:
                completed.add(('duty', d.id))
            elif s in (1, 2, 3):
                in_progress.add(('duty', d.id))
                end = d.latest_expected_end_date or d.expected_end_date
                if end:
                    try:
                        if datetime.strptime(end, "%Y-%m-%d").date() < today:
                            overdue.add(('duty', d.id))
                    except ValueError:
                        pass

        # 总工时从 MongoDB 汇总（去重按 log_date + work_no）
        from dbs.mongo_db.client import mongo_client
        col = mongo_client.db["daily_logs"]
        total_hours = 0.0
        for wn in member_work_nos:
            logs = col.find({"work_no": wn})
            for lg in logs:
                total_hours += float(lg.get("total_hours") or 0)

        return {
            "total_hours": round(total_hours, 1),
            "completed_tasks": len(completed),
            "in_progress_tasks": len(in_progress),
            "overdue_tasks": len(overdue),
        }

    def _build_member_stat(self, user: UserProfileModel, start_date, end_date):
        work_no = user.work_no
        today = datetime.today().date()

        # ── 功能任务统计 ───────────────────────────────────────────────
        all_funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.status == 1,
            FunctionDataModel.responsible.like(f'%"{work_no}"%'),
        ).all()

        completed_tasks = 0
        in_progress_tasks = 0
        overdue_tasks = 0
        overdue_days = 0
        urgent_tasks = 0
        urgent_threshold = today + timedelta(days=7)

        for f in all_funcs:
            resp = json.loads(f.responsible) if f.responsible else []
            if work_no not in resp:
                continue

            s = f.function_status or 0
            if s == 4:           # 已完成
                completed_tasks += 1
            elif s in (1, 2, 3): # 未开始/进行中/待验收
                in_progress_tasks += 1
                end = f.expected_end_date
                if end:
                    try:
                        end_dt = datetime.strptime(end, "%Y-%m-%d").date()
                        if end_dt < today:
                            overdue_tasks += 1
                            overdue_days += (today - end_dt).days
                        elif end_dt <= urgent_threshold:
                            urgent_tasks += 1
                    except ValueError:
                        pass

        # ── 临时任务统计 ──────────────────────────────────────────────
        all_duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.status == 1,
            TemporaryDutyModel.responsible.like(f"%{work_no}%"),
        ).all()

        for d in all_duties:
            resp = json.loads(d.responsible) if d.responsible else []
            if work_no not in resp:
                continue

            s = d.duty_status or 0
            if s == 4:
                completed_tasks += 1
            elif s in (1, 2, 3):
                in_progress_tasks += 1
                end = d.latest_expected_end_date or d.expected_end_date
                if end:
                    try:
                        end_dt = datetime.strptime(end, "%Y-%m-%d").date()
                        if end_dt < today:
                            overdue_tasks += 1
                            overdue_days += (today - end_dt).days
                        elif end_dt <= urgent_threshold:
                            urgent_tasks += 1
                    except ValueError:
                        pass

        # ── 今日日报是否提交（MongoDB） ────────────────────────────────
        from dbs.mongo_db.client import mongo_client
        col = mongo_client.db["daily_logs"]
        today_str = today.strftime("%Y-%m-%d")
        today_log = col.find_one({"work_no": work_no, "log_date": today_str})
        log_submitted = today_log is not None and int(today_log.get("log_status") or 0) >= 2

        # ── 工时统计（MongoDB） ────────────────────────────────────────
        log_query: dict = {"work_no": work_no}
        if start_date or end_date:
            log_query["log_date"] = {}
            if start_date:
                log_query["log_date"]["$gte"] = start_date
            if end_date:
                log_query["log_date"]["$lte"] = end_date
        logs = list(col.find(log_query))
        total_hours = round(sum(float(lg.get("total_hours") or 0) for lg in logs), 1)

        # ── 按周聚合工时 ──────────────────────────────────────────────
        weekly_map: dict = {}
        for lg in logs:
            log_date = lg.get("log_date")
            if not log_date:
                continue
            try:
                d = datetime.strptime(str(log_date), "%Y-%m-%d").date()
            except ValueError:
                continue
            monday = d - timedelta(days=d.weekday())
            sunday = monday + timedelta(days=6)
            week_key = f"{monday.strftime('%m/%d')}~{sunday.strftime('%m/%d')}"
            weekly_map[week_key] = round(
                weekly_map.get(week_key, 0) + float(lg.get("total_hours") or 0), 1
            )

        weekly_hours = [
            {"week": k, "hours": v}
            for k, v in sorted(weekly_map.items())
        ]

        return {
            "work_no": work_no,
            "name": user.name,
            "department": user.department or "",
            "position": user.position or "",
            "total_hours": total_hours,
            "completed_tasks": completed_tasks,
            "in_progress_tasks": in_progress_tasks,
            "overdue_tasks": overdue_tasks,
            "overdue_days": overdue_days,
            "urgent_tasks": urgent_tasks,
            "log_submitted": log_submitted,
            "weekly_hours": weekly_hours,
        }

    def get_personal_stats(self, work_no: str, start_date: str = None, end_date: str = None):
        """
        获取指定成员的个人详细工时分析：
        - project_dist:   [{name, hours}]  专案工时分布
        - category_dist:  [{name, hours}]  工作分类分布
        - weekly_overtime:[{week, normal, overtime}]  近期每周正常/加班工时
        """
        from dbs.mongo_db.client import mongo_client
        col = mongo_client.db["daily_logs"]
        log_query: dict = {"work_no": work_no}
        if start_date or end_date:
            log_query["log_date"] = {}
            if start_date:
                log_query["log_date"]["$gte"] = start_date
            if end_date:
                log_query["log_date"]["$lte"] = end_date
        logs = list(col.find(log_query).sort("log_date", 1))

        project_map: dict  = {}   # project_nm -> hours
        category_map: dict = {}   # category   -> hours
        weekly_map: dict   = {}   # week_key   -> {normal, overtime}

        CATEGORY_LABEL = {
            "project":  "專案任務",
            "duty":     "臨時任務",
            "meeting":  "會議",
            "training": "培訓",
            "cr_ar":    "CR/AR",
            "other":    "其他",
        }

        for lg in logs:
            log_date = lg.get("log_date")
            # ── task_items（MongoDB 直接是 list） ─────────────────────
            task_items = lg.get("task_items") or []

            for t in task_items:
                hours    = float(t.get("work_hours") or 0)
                is_ot    = bool(t.get("is_overtime"))
                ot_hours = float(t.get("overtime_hours") or 0) if is_ot else 0
                # 专案分布（project 类型才有 project_nm）
                if t.get("task_type") == "project":
                    proj = t.get("project_nm") or t.get("task_nm") or "未知专案"
                    project_map[proj] = round(project_map.get(proj, 0) + hours, 1)
                # 分类分布
                cat_key = "project" if t.get("task_type") == "project" else "duty"
                cat_label = CATEGORY_LABEL.get(cat_key, cat_key)
                category_map[cat_label] = round(category_map.get(cat_label, 0) + hours, 1)
                # 周加班
                self._add_weekly_overtime(log_date, hours, ot_hours, weekly_map)

            # ── free_items（MongoDB 直接是 list） ─────────────────────
            free_items = lg.get("free_items") or []

            for f in free_items:
                hours    = float(f.get("work_hours") or 0)
                is_ot    = bool(f.get("is_overtime"))
                ot_hours = float(f.get("overtime_hours") or 0) if is_ot else 0
                cat_key  = f.get("category") or "other"
                cat_label = CATEGORY_LABEL.get(cat_key, cat_key)
                category_map[cat_label] = round(category_map.get(cat_label, 0) + hours, 1)
                self._add_weekly_overtime(log_date, hours, ot_hours, weekly_map)

        project_dist  = [{"name": k, "hours": v} for k, v in sorted(project_map.items(),  key=lambda x: -x[1])]
        category_dist = [{"name": k, "hours": v} for k, v in sorted(category_map.items(), key=lambda x: -x[1])]
        weekly_overtime = [
            {"week": k, "normal": round(v["total"] - v["overtime"], 1), "overtime": v["overtime"]}
            for k, v in sorted(weekly_map.items())
        ]

        return {
            "project_dist":   project_dist,
            "category_dist":  category_dist,
            "weekly_overtime": weekly_overtime,
        }

    @staticmethod
    def _add_weekly_overtime(log_date, hours, ot_hours, weekly_map):
        if not log_date:
            return
        try:
            d = datetime.strptime(str(log_date), "%Y-%m-%d").date()
        except ValueError:
            return
        monday = d - timedelta(days=d.weekday())
        sunday = monday + timedelta(days=6)
        week_key = f"{monday.strftime('%m/%d')}~{sunday.strftime('%m/%d')}"
        if week_key not in weekly_map:
            weekly_map[week_key] = {"total": 0, "overtime": 0}
        weekly_map[week_key]["total"]    = round(weekly_map[week_key]["total"]    + hours,    1)
        weekly_map[week_key]["overtime"] = round(weekly_map[week_key]["overtime"] + ot_hours, 1)

    def get_progress_report(self, work_no: str, start_date: str, end_date: str):
        """
        进度报告：按日期范围返回每位成员的工作汇整。
        数据来源：MongoDB daily_logs（日报）+ MySQL 任务状态。
        """
        from controllers.user_controller import UserController
        from dbs.mysql_db.model_tables import ProjectDataModel
        from dbs.mongo_db.client import mongo_client

        user_ctrl = UserController()
        subordinates = user_ctrl.get_subordinates(work_no, all_levels=True)
        sub_work_nos = [s["work_no"] for s in subordinates]

        if sub_work_nos:
            users = db.session.query(UserProfileModel).filter(
                UserProfileModel.work_no.in_(sub_work_nos), UserProfileModel.status == 1
            ).all()
        else:
            users = db.session.query(UserProfileModel).filter(
                UserProfileModel.status == 1, UserProfileModel.work_no != work_no
            ).all()

        today = datetime.today().date()

        # 项目名称缓存
        proj_cache: dict = {}
        def _proj_name(pid: str) -> str:
            if pid not in proj_cache:
                p = db.session.query(ProjectDataModel).filter_by(id=pid).first()
                proj_cache[pid] = p.project_nm if p else "未知專案"
            return proj_cache[pid]

        CATEGORY_LABEL = {
            "project": "專案任務", "duty": "臨時任務",
            "meeting": "會議", "training": "培訓",
            "cr_ar": "CR/AR", "other": "其他",
        }

        col = mongo_client.db["daily_logs"]

        result = []
        for user in users:
            wn = user.work_no

            # ── 进度记录（MySQL）：工时 + 更新次数（含合作者） ──────
            prog_q = db.session.query(ProgressRecordDataModel).filter(
                db.or_(
                    ProgressRecordDataModel.submitter == wn,
                    ProgressRecordDataModel.cooperator.like(f'%"{wn}"%'),
                ),
            )
            duty_prog_q = db.session.query(DutyProgressRecordModel).filter(
                db.or_(
                    DutyProgressRecordModel.submitter == wn,
                    DutyProgressRecordModel.cooperator.like(f'%"{wn}"%'),
                ),
            )
            if start_date:
                prog_q      = prog_q.filter(ProgressRecordDataModel.created_at >= start_date)
                duty_prog_q = duty_prog_q.filter(DutyProgressRecordModel.created_at >= start_date)
            if end_date:
                prog_q      = prog_q.filter(ProgressRecordDataModel.created_at <= end_date + " 23:59:59")
                duty_prog_q = duty_prog_q.filter(DutyProgressRecordModel.created_at <= end_date + " 23:59:59")
            prog_recs      = prog_q.all()
            duty_prog_recs  = duty_prog_q.all()

            updates_count = len(prog_recs) + len(duty_prog_recs)
            period_hours  = round(
                sum(float(r.time_consum or 0) for r in prog_recs) +
                sum(float(r.time_consum or 0) for r in duty_prog_recs),
                1,
            )

            # ── 日报原始数据（MongoDB） ─────────────────────────────
            log_query: dict = {"work_no": wn, "status": 1}
            if start_date or end_date:
                log_query["log_date"] = {}
                if start_date:
                    log_query["log_date"]["$gte"] = start_date
                if end_date:
                    log_query["log_date"]["$lte"] = end_date
            logs = list(col.find(log_query).sort("log_date", -1))

            # 返回原始日报详情列表（与 daily_log API 的 _to_detail 格式一致）
            daily_logs = []
            for lg in logs:
                task_items = lg.get("task_items") or []
                free_items = lg.get("free_items") or []
                daily_logs.append({
                    "log_id":      lg.get("log_id", ""),
                    "work_no":     wn,
                    "log_date":    lg.get("log_date", ""),
                    "total_hours": float(lg.get("total_hours") or 0),
                    "status":      lg.get("log_status", 1),
                    "task_items":  task_items,
                    "free_items":  free_items,
                    "remark":      lg.get("remark", ""),
                })

            # ── 任务状态（MySQL，按时间范围过滤） ────────────────────
            completed_list = []
            in_progress_list = []
            overdue_list = []
            not_started_list = []

            # 从日报 task_items 汇总每个 function 的实际工时
            func_hours: dict = {}
            for lg in logs:
                for t in (lg.get("task_items") or []):
                    fid = t.get("task_id") or ""
                    if fid:
                        func_hours[fid] = func_hours.get(fid, 0) + float(t.get("work_hours") or 0)

            all_funcs = db.session.query(FunctionDataModel).filter(
                FunctionDataModel.status == 1,
                FunctionDataModel.responsible.like(f'%"{wn}"%'),
            ).all()
            for f in all_funcs:
                resp = json.loads(f.responsible) if f.responsible else []
                if wn not in resp:
                    continue
                proj_nm = _proj_name(f.project_id)
                s = f.function_status or 0
                f_start = f.expected_start_date or ""
                f_end = f.expected_end_date or ""
                f_actual_end = (f.end_time or "")[:10]
                task_hours = round(func_hours.get(f.id, 0), 1)

                if s == 4:
                    # 已完成：仅显示在本期内完成的
                    if f_actual_end and start_date <= f_actual_end <= end_date:
                        completed_list.append({
                            "id": f.id, "name": f.function_nm, "project": proj_nm,
                            "type": "function",
                            "completed_at": f_actual_end,
                            "hours": task_hours,
                            "expected_start_date": f_start,
                            "expected_end_date": f_end,
                        })
                elif s in (2, 3):
                    # 进行中
                    days_left = 999
                    task_status = "normal"
                    if f_end:
                        try:
                            end_dt = datetime.strptime(f_end, "%Y-%m-%d").date()
                            days_left = (end_dt - today).days
                            if days_left < 0:
                                task_status = "overdue"
                                overdue_list.append({
                                    "id": f.id, "name": f.function_nm,
                                    "project": proj_nm, "days_overdue": abs(days_left),
                                })
                            elif days_left <= 3:
                                task_status = "urgent"
                        except ValueError:
                            pass
                    in_progress_list.append({
                        "id": f.id, "name": f.function_nm, "project": proj_nm,
                        "progress": f.progress or 0, "days_left": days_left,
                        "status": task_status,
                        "expected_start_date": f_start,
                        "expected_end_date": f_end,
                        "hours": task_hours,
                    })
                elif s == 1:
                    # 未开始：仅显示预计开始时间在本期范围内的
                    if f_start and start_date <= f_start <= end_date:
                        days_left = 999
                        task_status = "normal"
                        if f_end:
                            try:
                                end_dt = datetime.strptime(f_end, "%Y-%m-%d").date()
                                days_left = (end_dt - today).days
                                if days_left < 0:
                                    task_status = "overdue"
                                elif days_left <= 3:
                                    task_status = "urgent"
                            except ValueError:
                                pass
                        not_started_list.append({
                            "id": f.id, "name": f.function_nm, "project": proj_nm,
                            "progress": 0, "days_left": days_left,
                            "status": task_status,
                            "expected_start_date": f_start,
                            "expected_end_date": f_end,
                        })

            result.append({
                "work_no":       wn,
                "name":          user.name,
                "period_hours":  period_hours,
                "updates_count": updates_count,
                "completed":     completed_list,
                "in_progress":   in_progress_list,
                "not_started":   not_started_list,
                "daily_logs":    daily_logs,
                "overdue":       overdue_list,
            })

        return result

    def get_anomalies(self, work_no: str):
        """
        异常管理看板：自动检测所有下属的异常项目。
        异常类型：
        - task_overdue:       任务已超期
        - task_urgent:        任务3天内到期
        - no_daily_log:       今日日报未填
        - insufficient_hours: 本周工时不足（<40h，以周五判断）
        - progress_stalled:   任务进行中但7天内无进度更新
        - project_delay:      专案整体进度落后
        - delay_no_report:    超期任务近7天无进度记录
        """
        from controllers.user_controller import UserController
        from dbs.mysql_db.model_tables import ProjectDataModel, ProgressRecordDataModel
        from dbs.mongo_db.client import mongo_client

        user_ctrl = UserController()
        subordinates = user_ctrl.get_subordinates(work_no, all_levels=True)
        sub_work_nos = [s["work_no"] for s in subordinates]

        if sub_work_nos:
            users = db.session.query(UserProfileModel).filter(
                UserProfileModel.work_no.in_(sub_work_nos), UserProfileModel.status == 1
            ).all()
        else:
            users = db.session.query(UserProfileModel).filter(
                UserProfileModel.status == 1, UserProfileModel.work_no != work_no
            ).all()

        name_map = {u.work_no: u.name for u in users}
        user_work_nos = [u.work_no for u in users]
        today = datetime.today().date()
        today_str = today.strftime("%Y-%m-%d")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        urgent_threshold = today + timedelta(days=3)
        week_start = today - timedelta(days=today.weekday())
        week_start_str = week_start.strftime("%Y-%m-%d")

        # 项目名称缓存
        proj_cache: dict = {}
        def _proj_name(pid: str) -> str:
            if pid not in proj_cache:
                p = db.session.query(ProjectDataModel).filter_by(id=pid).first()
                proj_cache[pid] = p.project_nm if p else "未知專案"
            return proj_cache[pid]

        anomalies = []
        idx = 0

        def _add(atype, level, title, desc, member_wn=None, project=None, task=None, value=None):
            nonlocal idx
            idx += 1
            anomalies.append({
                "id": f"a-{idx}",
                "type": atype, "level": level,
                "title": title, "description": desc,
                "member": name_map.get(member_wn, member_wn) if member_wn else None,
                "member_work_no": member_wn,
                "project": project, "task": task,
                "value": value, "detected_at": now_str,
                "resolved": False,
            })

        # ── 1. 任务异常（超期 / 即将超期 / 进度停滞） ──────────────────
        all_funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.status == 1,
            FunctionDataModel.function_status.in_([1, 2, 3]),
        ).all()

        for f in all_funcs:
            resp = json.loads(f.responsible) if f.responsible else []
            matched = [w for w in resp if w in user_work_nos]
            if not matched:
                continue
            proj_nm = _proj_name(f.project_id)
            end = f.expected_end_date
            if not end:
                continue
            try:
                end_dt = datetime.strptime(end, "%Y-%m-%d").date()
            except ValueError:
                continue

            for wn in matched:
                member_nm = name_map.get(wn, wn)
                if end_dt < today:
                    days_over = (today - end_dt).days
                    _add("task_overdue", "critical",
                         f"{member_nm} 任務超期 {days_over} 天",
                         f"任務「{f.function_nm}」預計 {end} 完成，已超期 {days_over} 天",
                         member_wn=wn, project=proj_nm, task=f.function_nm, value=days_over)

                    # delay_no_report: 超期但近7天无进度记录
                    seven_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
                    recent = db.session.query(ProgressRecordDataModel).filter(
                        ProgressRecordDataModel.function_id == f.id,
                        ProgressRecordDataModel.submitter == wn,
                        ProgressRecordDataModel.created_at >= seven_days_ago,
                    ).count()
                    if recent == 0:
                        _add("delay_no_report", "critical",
                             f"{member_nm} 超期任務 7 天未更新進度",
                             f"任務「{f.function_nm}」已超期且近 7 天無進度記錄",
                             member_wn=wn, project=proj_nm, task=f.function_nm, value=days_over)

                elif end_dt <= urgent_threshold:
                    days_left = (end_dt - today).days
                    _add("task_urgent", "warning",
                         f"{member_nm} 任務即將到期（剩 {days_left} 天）",
                         f"任務「{f.function_nm}」預計 {end} 完成，僅剩 {days_left} 天",
                         member_wn=wn, project=proj_nm, task=f.function_nm, value=days_left)

            # progress_stalled: 进行中但7天无更新（只检查一次，不按成员）
            if f.function_status in (2, 3):
                seven_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
                recent_any = db.session.query(ProgressRecordDataModel).filter(
                    ProgressRecordDataModel.function_id == f.id,
                    ProgressRecordDataModel.created_at >= seven_days_ago,
                ).count()
                if recent_any == 0 and matched:
                    wn0 = matched[0]
                    _add("progress_stalled", "warning",
                         f"任務「{f.function_nm}」進度停滯",
                         f"任務已進行中但近 7 天無人提交進度更新",
                         member_wn=wn0, project=proj_nm, task=f.function_nm)

        # ── 2. 日报异常（今日未填） ────────────────────────────────────
        col = mongo_client.db["daily_logs"]
        for wn in user_work_nos:
            has_log = col.count_documents({"work_no": wn, "log_date": today_str, "status": 1}, limit=1)
            if not has_log:
                _add("no_daily_log", "info",
                     f"{name_map.get(wn, wn)} 今日尚未填寫日報",
                     f"截至目前未提交 {today_str} 的工作日誌",
                     member_wn=wn)

        # ── 3. 工时不足（本周 < 标准工时） ─────────────────────────────
        # 只在周三之后检查，给成员时间填写
        if today.weekday() >= 2:
            standard_hours = (today.weekday() + 1) * 8  # 按已过天数计算应有工时
            for wn in user_work_nos:
                logs = list(col.find({"work_no": wn, "log_date": {"$gte": week_start_str, "$lte": today_str}}))
                week_hours = sum(float(lg.get("total_hours") or 0) for lg in logs)
                if week_hours < standard_hours * 0.6:  # 低于应有工时的60%才报
                    _add("insufficient_hours", "warning",
                         f"{name_map.get(wn, wn)} 本週工時不足",
                         f"本週已記錄 {round(week_hours, 1)}h，預期至少 {round(standard_hours * 0.6, 1)}h",
                         member_wn=wn, value=round(week_hours, 1))

        # ── 4. 专案Delay ──────────────────────────────────────────────
        active_projects = db.session.query(ProjectDataModel).filter(
            ProjectDataModel.project_status.in_([3, 4, 5, 10, 11]),
            ProjectDataModel.status == 1,
        ).all()
        for p in active_projects:
            end = p.expected_end_date
            if not end:
                continue
            try:
                end_dt = datetime.strptime(end, "%Y-%m-%d").date()
            except ValueError:
                continue
            if end_dt < today:
                days_over = (today - end_dt).days
                pm_wn = p.project_pm
                if pm_wn in user_work_nos or not sub_work_nos:
                    _add("project_delay", "critical",
                         f"專案「{p.project_nm}」已 Delay {days_over} 天",
                         f"預計 {end} 結案，已超期 {days_over} 天",
                         member_wn=pm_wn, project=p.project_nm, value=days_over)

        return anomalies
