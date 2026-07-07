# -*- coding: utf-8 -*-
"""需求控制器"""
import json

from configs.base import BaseConfig
from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, BusinessException, PermissionException
from dbs.mysql_db import db
from tables.requirement_table import RequirementModel
from tables.project_table import ProjectDataModel
from tables.review_table import ReviewApplyModel
from tables.user_table import UserProfileModel
from tables.function_table import FunctionDataModel
from daos.requirement_dao import RequirementDAO

_dao = RequirementDAO()


class RequirementController:

    @staticmethod
    def _sync_project_req_progress(req_id: str):
        """根据关联任务重算专案需求进度和预计完成时间，并自动切换已完結状态"""
        req = _dao.find_by_id(req_id)
        if not req or req.req_status in (9,):
            return
        funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.requirement_id == req_id,
            FunctionDataModel.function_status != 9,
        ).all()
        if not funcs:
            req.progress = 0
        else:
            avg = round(sum(int(f.progress or 0) for f in funcs) / len(funcs))
            req.progress = avg
            # 已完结(4)的需求如果进度不再100%，恢复为进行中(2)
            if req.req_status == 4 and avg < 100:
                req.req_status = 2
            # 同步预计完成时间：取所有任务中最晚的日期（优先用延期后的）
            end_dates = [
                f.latest_expected_end_date or f.expected_end_date
                for f in funcs
                if f.expected_end_date
            ]
            if end_dates:
                req.expected_end_date = max(end_dates)
        req.update_at = CommonTools.get_now()

    def _batch_calc_req_stats(self, req_ids: list, project_ids: list) -> dict:
        """批量计算需求的进度和预计完成时间"""
        from collections import defaultdict
        if not req_ids:
            return {}
        all_proj_ids = list(set(project_ids))
        req_id_set = set(req_ids)
        funcs = db.session.query(
            FunctionDataModel.requirement_id,
            FunctionDataModel.progress,
            FunctionDataModel.expected_end_date,
            FunctionDataModel.latest_expected_end_date,
        ).filter(
            FunctionDataModel.project_id.in_(all_proj_ids),
            FunctionDataModel.function_status != 9,
            FunctionDataModel.requirement_id.isnot(None),
        ).all()

        req_progress: dict = defaultdict(list)
        req_dates: dict = defaultdict(list)
        for f_req_id, f_prog, f_end, f_latest_end in funcs:
            if f_req_id not in req_id_set:
                continue
            req_progress[f_req_id].append(int(f_prog or 0))
            effective_end = f_latest_end or f_end
            if effective_end:
                req_dates[f_req_id].append(effective_end)

        result = {}
        for rid in req_id_set:
            progs = req_progress.get(rid)
            dates = req_dates.get(rid)
            result[rid] = {
                "progress": round(sum(progs) / len(progs)) if progs else None,
                "expected_end_date": max(dates) if dates else None,
            }
        return result

    # ── 列表 ────────────────────────────────────────────────────────────────────

    def list_all(self, payload: dict, work_no: str = ""):
        """全局需求列表（分页）— 普通用户只看自己参与的专案需求，主管看组内所有"""
        keyword  = payload.get("keyword", "")
        status   = payload.get("status")
        priority = payload.get("priority")
        page     = int(payload.get("page", 1))
        size     = int(payload.get("size", 20))

        q = _dao.list_active_query()

        # 权限过滤：只显示用户有权查看的专案的需求
        if work_no:
            from controllers.user_controller import UserController
            from tables.user_table import HierarchyModel
            user_ctrl = UserController()
            is_supervisor = db.session.query(HierarchyModel).filter_by(
                supervisor_work_no=work_no
            ).first() is not None

            if is_supervisor:
                # 主管：自己参与的 + 组内成员参与的专案需求
                subordinates = user_ctrl.get_subordinates(work_no, all_levels=True)
                all_wnos = [work_no] + [s["work_no"] for s in subordinates]
            else:
                all_wnos = [work_no]

            # 查找这些用户参与的专案ID（作为PM或任务负责人）
            pm_proj_ids = set(
                p.id for p in db.session.query(ProjectDataModel.id).filter(
                    db.or_(
                        db.func.lower(ProjectDataModel.project_pm).in_([w.lower() for w in all_wnos]),
                        db.func.lower(ProjectDataModel.product_pm).in_([w.lower() for w in all_wnos]),
                    ),
                    ProjectDataModel.project_status != 9,
                ).all()
            )
            # 也包含作为任务负责人的专案
            func_conds = [FunctionDataModel.responsible.like(f'%"{wn}"%') for wn in all_wnos]
            func_proj_ids = set(
                f.project_id for f in db.session.query(FunctionDataModel.project_id).filter(
                    FunctionDataModel.status == 1,
                    db.or_(*func_conds) if func_conds else db.false(),
                ).distinct().all()
            ) if func_conds else set()

            allowed_proj_ids = pm_proj_ids | func_proj_ids
            if allowed_proj_ids:
                q = q.filter(RequirementModel.project_id.in_(allowed_proj_ids))
            else:
                q = q.filter(db.false())  # 无权查看任何需求

        if keyword:
            q = q.filter(RequirementModel.req_nm.like(f"%{keyword}%"))
        if status is not None:
            q = q.filter(RequirementModel.req_status == int(status))
        if priority is not None:
            q = q.filter(RequirementModel.priority == int(priority))

        total = q.count()
        items = q.order_by(RequirementModel.created_at.desc()).offset((page - 1) * size).limit(size).all()

        project_ids = {r.project_id for r in items}
        creator_nos = {r.creator for r in items if r.creator}

        proj_map = _dao.project_name_map(project_ids)
        name_map = _dao.creator_name_map(creator_nos)

        # 批量动态计算需求进度和预计完成时间
        req_stats = self._batch_calc_req_stats([r.id for r in items], [r.project_id for r in items])

        data = []
        for r in items:
            d = r.to_dict()
            d["creator_nm"] = name_map.get((r.creator or "").lower(), r.creator or "")
            d["project_nm"] = proj_map.get(r.project_id, "")
            stats = req_stats.get(r.id, {})
            if stats.get("progress") is not None:
                d["progress"] = stats["progress"]
            if stats.get("expected_end_date"):
                d["expected_end_date"] = stats["expected_end_date"]
            data.append(d)

        return {"data_list": data, "total_count": total, "page": page, "size": size}

    def get_requirements(self, project_id: str):
        """获取专案下所有未删除的需求"""
        reqs = _dao.list_by_project(project_id)
        # 补充创建人姓名
        creator_nos = {r.creator for r in reqs if r.creator}
        name_map = _dao.creator_name_map(creator_nos)

        req_stats = self._batch_calc_req_stats([r.id for r in reqs], [project_id])

        result = []
        for r in reqs:
            d = r.to_dict()
            d["creator_nm"] = name_map.get((r.creator or "").lower(), r.creator or "")
            stats = req_stats.get(r.id, {})
            if stats.get("progress") is not None:
                d["progress"] = stats["progress"]
            if stats.get("expected_end_date"):
                d["expected_end_date"] = stats["expected_end_date"]
            result.append(d)
        return result

    # ── 详情 ────────────────────────────────────────────────────────────────────

    def get_requirement(self, req_id: str):
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        u = _dao.find_creator_user(r.creator)
        d = r.to_dict()
        d["creator_nm"] = u.name if u else (r.creator or "")
        return d

    # ── 新建 ────────────────────────────────────────────────────────────────────

    def create_requirement(self, project_id: str, payload: dict, creator: str):
        p = _dao.find_project(project_id)
        if not p or p.project_status == 9:
            raise ResourceNotFoundException(resource_type="专案")
        # 只有产品PM可创建需求
        creator = (creator or "").strip().lower()
        if creator != (p.product_pm or "").strip().lower():
            raise PermissionException(msg="只有產品PM可以新增需求")
        # 草稿(1)：需求随立案审核一起通过，无需单独审核
        # 執行中(5)：新增需求需单独提交审核
        if p.project_status not in (1, 5):
            raise PermissionException(msg="只有草稿或執行中階段的專案可以新增需求")

        resp = payload.get("responsible", [])
        if isinstance(resp, str):
            try:
                resp = json.loads(resp)
            except Exception:
                resp = [resp] if resp else []
        resp = [str(w).strip().lower() for w in (resp if isinstance(resp, list) else []) if w]

        req = RequirementModel(
            project_id=project_id,
            req_nm=payload["req_nm"],
            describe=payload.get("describe", ""),
            priority=payload.get("priority", 2),
            creator=creator,
            responsible_json=json.dumps(resp, ensure_ascii=False),
            expected_benefit=payload.get("expected_benefit", ""),
            benefit_amount=payload.get("benefit_amount"),
            benefit_unit=payload.get("benefit_unit", "元/年"),
            is_addon=bool(payload.get("is_addon", False)),
            files_json=json.dumps(payload.get("files", []), ensure_ascii=False),
            expected_end_date=payload.get("expected_end_date", ""),
            create_stage_tasks=bool(payload.get("create_stage_tasks", False)),
        )
        _dao.add(req)
        _dao.flush()

        # 立案前的需求：自动创建「需求评估与立案」阶段任务
        if p.project_status == 1 and req.create_stage_tasks:  # 草稿阶段 + 开启阶段任务
            from controllers.project_controller import ProjectController
            proj_ctrl = ProjectController()
            proj_ctrl._create_stage_task(project_id, "initiate", req.id, req.req_nm)

        _dao.commit()

        # 通知非建立人的負責人
        notif_targets = [w for w in resp if w != creator]
        if notif_targets:
            from controllers.notification_controller import push_notification
            creator_user = _dao.find_creator_user(creator)
            creator_nm = creator_user.name if creator_user else creator
            push_notification(
                notif_targets,
                title="您被指定為需求負責人",
                desc=f"【{p.project_nm}】需求「{req.req_nm}」，建立人：{creator_nm}",
                link_type="project",
                link_id=project_id,
            )

        return req.to_dict()

    # ── 更新 ────────────────────────────────────────────────────────────────────

    def update_requirement(self, req_id: str, payload: dict, operator: str):
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        # 允许将进行中(2)的需求标记为已完结(4)
        if "status" in payload and int(payload["status"]) == 4 and r.req_status == 2:
            r.req_status = 4
            r.update_at = CommonTools.get_now()
            db.session.commit()
            return r.to_dict()
        # 允许将搁置(8)的需求恢复为进行中(2)，同时恢复任务
        if "status" in payload and int(payload["status"]) == 2 and r.req_status == 8:
            r.req_status = 2
            r.shelve_reason = None
            now = CommonTools.get_now()
            r.update_at = now
            # 恢復由需求搁置連帶搁置的任務（有 pre_shelve_status 記錄的）
            shelved_funcs = db.session.query(FunctionDataModel).filter(
                FunctionDataModel.requirement_id == req_id,
                FunctionDataModel.function_status == 8,
                FunctionDataModel.pre_shelve_status.isnot(None),
            ).all()
            for fn in shelved_funcs:
                fn.function_status = fn.pre_shelve_status
                fn.pre_shelve_status = None
                fn.update_at = now
            db.session.commit()
            return r.to_dict()
        # 只有草稿狀態的需求可以修改，專案必須在草稿或執行中階段
        if r.req_status != 0:
            raise PermissionException(msg="只有草稿狀態的需求可以修改")
        p = _dao.find_project(r.project_id)
        if not p or p.project_status not in (1, 5):
            raise PermissionException(msg="只有草稿或執行中階段的專案才能修改需求")

        for field in ("req_nm", "describe", "priority", "expected_benefit",
                      "benefit_amount", "benefit_unit", "expected_end_date"):
            if field in payload and payload[field] is not None:
                setattr(r, field, payload[field])
        if "is_addon" in payload:
            r.is_addon = bool(payload["is_addon"])
        if "create_stage_tasks" in payload:
            r.create_stage_tasks = bool(payload["create_stage_tasks"])
        if "files" in payload:
            r.files_json = json.dumps(payload["files"], ensure_ascii=False)
        if "responsible" in payload:
            resp = payload["responsible"] or []
            if isinstance(resp, str):
                try:
                    resp = json.loads(resp)
                except Exception:
                    resp = [resp] if resp else []
            resp = [str(w).strip().lower() for w in (resp if isinstance(resp, list) else []) if w]
            r.responsible_json = json.dumps(resp, ensure_ascii=False)
        r.update_at = CommonTools.get_now()
        _dao.commit()
        return r.to_dict()

    # ── 删除 ────────────────────────────────────────────────────────────────────

    def delete_requirement(self, req_id: str, operator: str):
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status != 0:
            raise PermissionException(msg="只有草稿狀態的需求可以刪除")
        p = _dao.find_project(r.project_id)
        if not p or p.project_status not in (1, 5):
            raise PermissionException(msg="只有草稿或執行中階段的專案才能刪除需求")
        r.req_status = 9
        r.update_at = CommonTools.get_now()
        _dao.commit()

    # ── 提交审核 ────────────────────────────────────────────────────────────────

    def submit_review(self, req_id: str, reviewer: list, operator: str):
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status == 1:
            raise PermissionException(msg="需求已在审核中")
        if r.req_status == 2:
            raise PermissionException(msg="需求已通过审核")

        p = _dao.find_project(r.project_id)
        # 只有執行中的專案才能提交需求審核（規劃/排程階段的需求隨排程審核一起通過）
        if not p or p.project_status != 5:
            raise PermissionException(msg="只有執行中的專案才能提交需求審核，規劃排程阶段的需求將隨排程審核自動通過")
        operator = (operator or "").strip().lower()
        reviewer = [(w or "").strip().lower() for w in reviewer if w]

        # 批量查询审核人与提交人姓名
        all_wks = list({operator} | set(reviewer))
        wk_user_map = _dao.creator_name_map(set(all_wks))
        # 需要完整用户对象来获取 name
        all_users = {
            u.work_no.lower(): u
            for u in db.session.query(UserProfileModel).filter(
                db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in all_wks])
            ).all()
        }
        nodes = []
        for i, wk in enumerate(reviewer):
            u = all_users.get(wk.lower())
            nodes.append({
                "node_id": f"{CommonTools.get_now().replace(' ', '')}_{i}",
                "order": i + 1,
                "approver": u.name if u else wk,
                "approver_work_no": wk,
                "status": 0,
                "is_countersign": False,
                "approved_at": None,
                "comment": None,
            })

        submitter_profile = all_users.get(operator.lower())
        submitter_name = submitter_profile.name if submitter_profile else operator

        apply = ReviewApplyModel(
            project_id=r.project_id,
            requirement_id=req_id,
            apply_type="需求審核",
            apply_type_code="requirement_review",
            submitter=operator,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer),
            priority=r.priority,
            description=r.req_nm,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        _dao.add(apply)
        r.req_status = 1
        r.update_at = CommonTools.get_now()
        _dao.commit()

        # 通知第一位审核人
        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title="您有新的需求審核待處理",
            desc=f"專案「{p.project_nm if p else ''}」的需求「{r.req_nm}」已提交審核，請及時處理。",
            link_type="review",
            link_id=apply.id,
        )
        return apply.to_dict()

    # ── 批量提交审核（单一审核单覆盖多条需求） ─────────────────────────────────────

    def batch_submit_review(self, project_id: str, requirement_ids: list, reviewer: list, operator: str):
        p = _dao.find_project(project_id)
        if not p or p.project_status != 5:
            raise PermissionException(msg="只有執行中的專案才能提交需求審核")
        operator = (operator or "").strip().lower()
        if operator != (p.product_pm or "").strip().lower():
            raise PermissionException(msg="只有產品PM可以提交需求審核")

        req_map = _dao.find_by_ids(requirement_ids)
        reqs = []
        for req_id in requirement_ids:
            r = req_map.get(req_id)
            if not r or r.req_status == 9:
                raise ResourceNotFoundException(resource_type="需求")
            if r.req_status != 0:
                raise PermissionException(msg=f"需求「{r.req_nm}」不在草稿狀態，無法提交審核")
            reqs.append(r)

        reviewer = [(w or "").strip().lower() for w in reviewer if w]
        reviewer_user_map = {
            u.work_no.lower(): u
            for u in db.session.query(UserProfileModel).filter(
                db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in reviewer])
            ).all()
        } if reviewer else {}
        nodes = []
        for i, wk in enumerate(reviewer):
            u = reviewer_user_map.get(wk.lower())
            nodes.append({
                "node_id": f"{CommonTools.get_now().replace(' ', '')}_{i}",
                "order": i + 1,
                "approver": u.name if u else wk,
                "approver_work_no": wk,
                "status": 0,
                "is_countersign": False,
                "approved_at": None,
                "comment": None,
            })

        submitter_profile = _dao.find_creator_user(operator)
        submitter_name = submitter_profile.name if submitter_profile else operator
        desc = "、".join(r.req_nm for r in reqs)

        apply = ReviewApplyModel(
            project_id=project_id,
            apply_type="需求批量審核",
            apply_type_code="requirement_batch_review",
            submitter=operator,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer),
            priority=max((r.priority for r in reqs), default=2),
            description=desc,
            requirement_ids_json=json.dumps(requirement_ids, ensure_ascii=False),
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        _dao.add(apply)
        for r in reqs:
            r.req_status = 1
            r.update_at = CommonTools.get_now()
        _dao.commit()

        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title="您有新的需求批量審核待處理",
            desc=f"專案「{p.project_nm}」的 {len(reqs)} 條需求已批量提交審核，請及時處理。",
            link_type="review",
            link_id=apply.id,
        )
        return apply.to_dict()

    # ── 搁置需求 ─────────────────────────────────────────────────────────────

    def submit_shelve(self, req_id: str, reason: str, operator: str):
        """直接搁置需求（無需審批），同時搁置其下進行中/未開始的任務"""
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status != 2:
            raise PermissionException(msg="只有進行中的需求才能搁置")

        now = CommonTools.get_now()
        r.req_status = 8
        r.shelve_reason = reason or ""
        r.update_at = now

        # 搁置需求下的進行中/未開始任務（記錄原始狀態以便恢復）
        shelved_funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.requirement_id == req_id,
            FunctionDataModel.function_status.in_([1, 2]),
        ).all()
        for fn in shelved_funcs:
            fn.pre_shelve_status = fn.function_status
            fn.function_status = 8
            fn.update_at = now

        db.session.commit()

        # 通知需求相關人員
        p = _dao.find_project(r.project_id)
        resp = []
        if r.responsible_json:
            try:
                resp = json.loads(r.responsible_json)
            except Exception:
                pass
        notif_targets = [w for w in resp if w != operator]
        if notif_targets:
            from controllers.notification_controller import push_notification
            push_notification(
                notif_targets,
                title="需求已搁置",
                desc=f"專案「{p.project_nm if p else ''}」的需求「{r.req_nm}」已搁置。原因：{reason or '未填寫'}",
                link_type="requirement",
                link_id=req_id,
            )

    # ── 文件管理 ────────────────────────────────────────────────────────────────

    def upload_file(self, req_id: str, file, uploader: str):
        """上传需求附件，保存到本地并记录到 files_json"""
        import os
        from flask import current_app
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")

        ALLOWED_EXT = {
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'png', 'jpg', 'jpeg', 'gif', 'zip', 'rar', 'txt', 'md',
        }
        filename = file.filename or ""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        if ext not in ALLOWED_EXT:
            raise BusinessException(msg=f"不支持的文件类型: {ext}")

        base_dir = os.path.abspath(BaseConfig.UPLOAD_DIR)
        upload_dir = os.path.join(base_dir, "requirements", req_id)
        os.makedirs(upload_dir, exist_ok=True)

        from tables.base_table import generate_uuid
        file_id = generate_uuid()
        stored_name = f"{file_id}.{ext}"
        abs_path = os.path.join(upload_dir, stored_name)
        file.save(abs_path)
        size = os.path.getsize(abs_path)

        rel_url = f"/api/project/{r.project_id}/requirements/{req_id}/files/{file_id}/preview"
        file_info = {"name": filename, "url": rel_url, "size": size, "file_id": file_id}

        files = []
        if r.files_json:
            try:
                files = json.loads(r.files_json)
            except Exception:
                pass
        files.append(file_info)
        r.files_json = json.dumps(files, ensure_ascii=False)
        r.update_at = CommonTools.get_now()
        _dao.commit()
        return {"files": files, "file": file_info}

    def get_req_file_path(self, req_id: str, file_id: str):
        """返回 (abs_path, original_name)，用于预览/下载"""
        import os
        from flask import current_app
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        files = []
        if r.files_json:
            try:
                files = json.loads(r.files_json)
            except Exception:
                pass
        file_info = next((f for f in files if f.get("file_id") == file_id), None)
        if not file_info:
            raise ResourceNotFoundException(resource_type="附件")
        base_dir = os.path.abspath(BaseConfig.UPLOAD_DIR)
        stored_url = file_info["url"]  # /uploads/requirements/{req_id}/{file_id}.ext
        rel_path = stored_url.lstrip("/")
        abs_path = os.path.join(os.path.dirname(base_dir), rel_path) if not os.path.isabs(base_dir) else stored_url
        # 重新从 base_dir 解析绝对路径
        ext = file_info["name"].rsplit(".", 1)[-1] if "." in file_info["name"] else "bin"
        abs_path = os.path.join(base_dir, "requirements", req_id, f"{file_id}.{ext}")
        return abs_path, file_info["name"]

    def remove_file(self, req_id: str, file_url: str):
        """从需求附件列表删除指定文件记录"""
        r = _dao.find_by_id(req_id)
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        files = []
        if r.files_json:
            try:
                files = json.loads(r.files_json)
            except Exception:
                pass
        files = [f for f in files if f.get("url") != file_url]
        r.files_json = json.dumps(files, ensure_ascii=False)
        r.update_at = CommonTools.get_now()
        _dao.commit()
        return files
