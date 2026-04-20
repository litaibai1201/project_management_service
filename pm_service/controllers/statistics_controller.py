# -*- coding: utf-8 -*-
"""统计控制器"""
import json
from datetime import datetime, timedelta
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    UserProfileModel, FunctionDataModel, TemporaryDutyModel,
)


class StatisticsController:

    def get_member_stats(self, work_no: str, start_date: str = None, end_date: str = None):
        """
        获取当前用户下属的工作统计（仅直接+间接下属，不含自身）
        返回字段与前端 MemberWorkStat 对应：
          work_no, name, total_hours,
          completed_tasks, overdue_tasks, overdue_days,
          in_progress_tasks, weekly_hours
        """
        from controllers.user_controller import UserController
        user_ctrl = UserController()
        subordinates = user_ctrl.get_subordinates(work_no, all_levels=True)
        sub_work_nos = [s["work_no"] for s in subordinates]

        if not sub_work_nos:
            return []

        users = (
            db.session.query(UserProfileModel)
            .filter(UserProfileModel.work_no.in_(sub_work_nos), UserProfileModel.status == 1)
            .all()
        )
        result = []
        for user in users:
            stat = self._build_member_stat(user, start_date, end_date)
            result.append(stat)
        return result

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
            week_key = monday.strftime("%Y-%m-%d")
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
