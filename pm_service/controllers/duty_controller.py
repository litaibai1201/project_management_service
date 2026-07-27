# -*- coding: utf-8 -*-
"""AR控制器"""
import json

from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, PermissionException, BusinessException, ValidationException
from dbs.mysql_db import db
from daos.duty_dao import DutyDAO
from dbs.mysql_db.model_tables import (
    TemporaryDutyModel, DutyProgressRecordModel, ReviewApplyModel, SystemModel, StandaloneReqModel, HierarchyModel
)

dao = DutyDAO()


class DutyController:

    @staticmethod
    def _sync_req_progress(standalone_req_id: str):
        """根据绑定任务重算需求进度和预计完成时间，并自动切换 進行中/已完結 状态"""
        req = dao.get_req_by_id(standalone_req_id)
        if not req or req.req_status in (9,):
            return
        duties = dao.query_duties_by_req(standalone_req_id)
        if not duties:
            req.progress = 0
        else:
            avg = round(sum(int(d.progress or 0) for d in duties) / len(duties))
            req.progress = avg
            # 已完结(4)的需求如果进度不再100%，恢复为进行中(2)
            if req.req_status == 4 and avg < 100:
                req.req_status = 2
            # 同步预计完成时间：取所有任务中最晚的 expected_end_date
            end_dates = [
                d.latest_expected_end_date or d.expected_end_date
                for d in duties
                if d.expected_end_date and d.duty_status != 9
            ]
            if end_dates:
                req.expected_end_date = max(end_dates)
        req.updated_at = CommonTools.get_now()

    def list_duties(self, payload: dict, work_no: str = None):
        page = payload.get("page", 1)
        size = payload.get("size", 20)

        q = dao.build_list_query(payload, work_no)
        total = q.count()
        duties = q.order_by(TemporaryDutyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        enriched = dao.enrich_duty_list(duties)
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": enriched,
        }

    def get_duty(self, duty_id: str):
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        result = d.to_dict()
        result['system_nm'] = dao.get_system_name(d.system_id)
        # 聚合已投入工时 (进度记录含合作人 + 日志)
        from controllers.daily_log_controller import DailyLogController
        prog_recs = db.session.query(DutyProgressRecordModel).filter_by(duty_id=duty_id).all()
        task_h, task_ot, _, _ = DailyLogController.compute_total_hours_with_cooperators(prog_recs, "duty")
        prog_h = round(task_h.get(duty_id, 0), 1)
        prog_ot = round(task_ot.get(duty_id, 0), 1)
        log_agg = DailyLogController.aggregate_log_hours("duty", [duty_id])
        log_h = log_agg.get(duty_id, {})
        result["total_hours"] = round(prog_h + log_h.get("hours", 0), 1)
        result["overtime_hours"] = round(prog_ot + log_h.get("overtime", 0), 1)
        return result

    def create_duty(self, payload: dict, creator: str):
        from utils.exceptions import ValidationException, PermissionException
        if not payload.get("duty_nm", "").strip():
            raise ValidationException(msg="任务名称不能为空")

        # ── 权限校验 ────────────────────────────────────────────────
        standalone_req_id = payload.get("standalone_req_id", "") or ""
        system_id = payload.get("system_id", "") or ""

        if standalone_req_id:
            # 系统需求任务：只有需求的负责人才能创建
            req = dao.get_req_by_id(standalone_req_id)
            if req:
                req_resp = json.loads(req.responsible) if req.responsible else []
                creator_lower = creator.lower()
                if creator_lower not in [w.lower() for w in req_resp]:
                    raise PermissionException(msg="仅需求负责人可新增任务")

        # ── 正常创建 ────────────────────────────────────────────────
        resp = payload.get("responsible", [])
        if isinstance(resp, str):
            try:
                resp = json.loads(resp)
            except Exception:
                resp = [resp] if resp else []
        resp = [str(w).strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
        d = TemporaryDutyModel(
            duty_nm=payload["duty_nm"],
            describe=payload.get("describe", ""),
            creator=creator,
            responsible=json.dumps(resp, ensure_ascii=False),
            priority=payload.get("priority", 2),
            group=payload.get("group", ""),
            system_id=payload.get("system_id", "") or None,
            standalone_req_id=payload.get("standalone_req_id", "") or None,
            expected_start_date=payload.get("expected_start_date", ""),
            expected_end_date=payload.get("expected_end_date", ""),
        )
        dao.add_and_commit(d)
        # 新增任務后重算需求进度（可能从已完結回到進行中）
        if d.standalone_req_id:
            self._sync_req_progress(d.standalone_req_id)
            dao.commit()
        # 通知非建立人的負責人
        from controllers.notification_controller import push_notification
        creator_display = f"{dao.get_user_display_name(creator)}({creator})"
        notif_targets = [w for w in resp if w != creator]
        if notif_targets:
            push_notification(
                notif_targets,
                title="您被指定為AR負責人",
                desc=f"「{d.duty_nm}」，建立人：{creator_display}",
                link_type="duty",
                link_id=d.id,
            )
        return {"duty_id": d.id}

    def submit_req_task_review(self, duty_id: str, payload: dict, work_no: str):
        """提交需求任務新增審核（草稿→待審，需主管審批後方可進行）"""
        from utils.exceptions import BusinessException
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="任務")
        if not d.standalone_req_id:
            raise BusinessException(msg="只有需求任務才需要提交審核")
        if d.duty_status != 0:
            raise BusinessException(msg="只有草稿狀態的任務才可提交審核")

        reviewer = payload.get("reviewer", [])
        if isinstance(reviewer, str):
            reviewer = [reviewer] if reviewer else []
        if not reviewer:
            raise BusinessException(msg="請選擇審核人")

        all_wks = list({work_no} | set(reviewer))
        user_map = dao.batch_get_user_map(all_wks)
        nodes = []
        for i, wk in enumerate(reviewer):
            u = user_map.get(wk.lower())
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

        submitter_profile = user_map.get(work_no.lower())
        submitter_name = submitter_profile.name if submitter_profile else work_no

        sys_nm = dao.get_system_name(d.system_id)
        req = dao.get_req_by_id(d.standalone_req_id)
        req_nm = req.req_nm if req else ""
        desc = f"[{req_nm}] {d.duty_nm}" if req_nm else d.duty_nm

        apply = ReviewApplyModel(
            system_id=d.system_id,
            requirement_id=d.standalone_req_id,
            function_ids_json=json.dumps([duty_id], ensure_ascii=False),
            apply_type="需求任務新增審核",
            apply_type_code="req_task_addition_review",
            submitter=work_no,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer, ensure_ascii=False),
            priority=d.priority,
            description=desc,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        d.duty_status = 5  # 審核中
        dao.add(apply)
        dao.commit()

        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        _ctx = f"【{sys_nm}】" if sys_nm else ""
        _req = f"需求「{req_nm}」" if req_nm else ""
        push_notification(
            first_reviewers,
            title="您有新的需求任務新增待審核",
            desc=f"{_ctx}{_req}任務「{d.duty_nm}」已提交審核，提交人：{submitter_name}，請及時處理。",
            link_type="review",
            link_id=apply.id,
        )
        return {"apply_id": apply.id}

    def batch_submit_req_task_review(self, duty_ids: list, payload: dict, work_no: str):
        """批量提交需求任務新增審核（多個草稿任務合併為一張審核單）"""
        if not duty_ids:
            raise BusinessException(msg="請選擇要提交審核的任務")

        duties = dao.find_draft_duties_by_ids(duty_ids)
        if not duties:
            raise BusinessException(msg="未找到可提交審核的草稿任務")

        # 所有任務必須屬於同一系統
        system_ids = {d.system_id for d in duties if d.system_id}
        if len(system_ids) > 1:
            raise BusinessException(msg="批量提交的任務必須屬於同一系統")
        system_id = system_ids.pop() if system_ids else None

        reviewer = payload.get("reviewer", [])
        if isinstance(reviewer, str):
            reviewer = [reviewer] if reviewer else []
        if not reviewer:
            raise BusinessException(msg="請選擇審核人")

        all_wks = list({work_no} | set(reviewer))
        user_map = dao.batch_get_user_map(all_wks)
        nodes = []
        for i, wk in enumerate(reviewer):
            u = user_map.get(wk.lower())
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

        submitter_profile = user_map.get(work_no.lower())
        submitter_name = submitter_profile.name if submitter_profile else work_no

        sys_nm = dao.get_system_name(system_id)
        desc = f"系統「{sys_nm}」新增 {len(duties)} 個需求任務" if sys_nm else f"新增 {len(duties)} 個需求任務"

        for d in duties:
            d.duty_status = 5  # 審核中
        apply = ReviewApplyModel(
            system_id=system_id,
            function_ids_json=json.dumps([d.id for d in duties], ensure_ascii=False),
            apply_type="需求任務新增審核",
            apply_type_code="req_task_addition_review",
            submitter=work_no,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer, ensure_ascii=False),
            description=desc,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        dao.add(apply)
        dao.commit()

        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title="您有新的需求任務新增待審核",
            desc=f"「{sys_nm}」新增了 {len(duties)} 個需求任務待您審核。",
            link_type="review",
            link_id=apply.id,
        )
        return {"apply_id": apply.id, "count": len(duties)}

    def update_duty(self, duty_id: str, payload: dict, work_no: str = None):
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        if work_no and d.creator != work_no:
            raise PermissionException("只有建立人可以修改任務基本資訊")
        for field in ("duty_nm", "describe", "priority", "group", "system_id",
                      "expected_start_date", "expected_end_date"):
            if field in payload and payload[field] is not None:
                setattr(d, field, payload[field])
        new_resp = []
        removed_resp = []
        old_resp_snap = []
        full_resp = []
        resp_changed = False
        if "responsible" in payload and payload["responsible"] is not None:
            resp = payload["responsible"]
            if isinstance(resp, str):
                try:
                    resp = json.loads(resp)
                except Exception:
                    resp = [resp] if resp else []
            resp = [str(w).strip().lower() for w in (resp if isinstance(resp, list) else [resp]) if w]
            old_resp_snap = json.loads(d.responsible) if d.responsible else []
            new_resp = [w for w in resp if w not in old_resp_snap]
            removed_resp = [w for w in old_resp_snap if w not in resp]
            full_resp = resp
            resp_changed = True
            d.responsible = json.dumps(resp, ensure_ascii=False)
        d.update_at = CommonTools.get_now()
        dao.commit()
        if resp_changed and (new_resp or removed_resp):
            from controllers.notification_controller import push_notification
            creator = d.creator
            op_nm = dao.get_user_display_name(work_no)
            # 通知新增负责人
            if new_resp:
                push_notification(
                    recipients=new_resp,
                    title="您已被指定為AR負責人",
                    desc=f"「{d.duty_nm}」已指派您為負責人，操作人：{op_nm}",
                    link_type="duty",
                    link_id=d.id,
                )
            # 通知已有负责人（有新成员加入时）
            existing_resp = [w for w in full_resp if w in old_resp_snap]
            if new_resp and existing_resp:
                push_notification(
                    recipients=existing_resp,
                    title="您負責的任務新增了負責人",
                    desc=f"「{d.duty_nm}」加入了新的負責人，操作人：{op_nm}",
                    link_type="duty",
                    link_id=d.id,
                )
            # 通知被移除的负责人
            if removed_resp:
                push_notification(
                    recipients=removed_resp,
                    title="您已被移除AR負責人",
                    desc=f"「{d.duty_nm}」已將您從負責人名單中移除，操作人：{op_nm}",
                    link_type="duty",
                    link_id=d.id,
                )
            # 通知建立人（若建立人不在变动名单中）
            changed_wns = set(new_resp + removed_resp)
            if creator and creator not in changed_wns:
                push_notification(
                    recipients=[creator],
                    title="AR負責人已調整",
                    desc=f"「{d.duty_nm}」的負責人已更新，操作人：{op_nm}",
                    link_type="duty",
                    link_id=d.id,
                )

    def reschedule_duty(self, duty_id: str, new_end_date: str, reason: str, operator: str):
        """延期AR：建立人或责任人可操作，记录延期历史"""
        if not new_end_date or not new_end_date.strip():
            raise ValidationException(msg="new_end_date 不能为空")  # noqa
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")

        responsible = []
        if d.responsible:
            try:
                responsible = json.loads(d.responsible)
            except Exception:
                responsible = [d.responsible]

        is_creator = d.creator.lower() == operator.lower()
        is_responsible = operator.lower() in [w.lower() for w in responsible]
        is_req_responsible = False
        if d.standalone_req_id:
            from tables.standalone_req_table import StandaloneReqModel
            req = StandaloneReqModel.query.get(d.standalone_req_id)
            if req and req.responsible:
                req_resp = json.loads(req.responsible) if isinstance(req.responsible, str) else []
                is_req_responsible = operator.lower() in [w.lower() for w in req_resp]
        if not is_creator and not is_responsible and not is_req_responsible:
            raise PermissionException("只有建立人、任務負責人或需求責任人可進行延期操作")

        current_end = d.latest_expected_end_date or d.expected_end_date or ""
        history = []
        if d.reschedule_log:
            try:
                history = json.loads(d.reschedule_log)
            except (ValueError, TypeError):
                pass

        history.append({
            "from": current_end,
            "to": new_end_date,
            "reason": reason,
            "date": CommonTools.get_now()[:10],
            "operator": operator,
        })

        d.latest_expected_end_date = new_end_date
        d.revision_count = (d.revision_count or 0) + 1
        d.reschedule_log = json.dumps(history, ensure_ascii=False)
        d.update_at = CommonTools.get_now()
        dao.commit()
        # 同步需求预计完成时间
        if d.standalone_req_id:
            self._sync_req_progress(d.standalone_req_id)
            dao.commit()
        # 延期通知：责任人操作 → 通知建立人 + 其他责任人；建立人操作 → 通知所有责任人
        from controllers.notification_controller import push_notification
        op_nm = dao.get_user_display_name(operator)
        notif_msg = f"「{d.duty_nm}」已延期至 {new_end_date}，原因：{reason}，操作人：{op_nm}"
        if is_responsible and not is_creator:
            # 责任人操作：通知建立人 + 其他责任人
            notif_targets = [d.creator] + [w for w in responsible if w.lower() != operator.lower()]
            notif_targets = list(dict.fromkeys(notif_targets))  # 去重保序
        else:
            # 建立人操作：通知所有责任人
            notif_targets = responsible
        if notif_targets:
            push_notification(
                recipients=notif_targets,
                title="AR已延期",
                desc=notif_msg,
                link_type="duty",
                link_id=d.id,
            )
        return d.to_dict()

    def set_dates(self, duty_id: str, payload: dict, operator: str):
        """首次设定预计开始/完成时间（仅当字段为空时允许，且任务已激活）"""
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        if d.duty_status not in (1, 6):
            raise BusinessException("只有進行中或未開始的任務可以設定時間")
        responsible = json.loads(d.responsible) if d.responsible else []
        op_lower = operator.lower()
        is_creator = d.creator.lower() == op_lower
        is_responsible = op_lower in [w.lower() for w in responsible]
        # 也允许需求负责人设定
        is_req_responsible = False
        if d.standalone_req_id:
            req = dao.get_req_by_id(d.standalone_req_id)
            if req:
                req_resp = json.loads(req.responsible) if req.responsible else []
                is_req_responsible = op_lower in [w.lower() for w in req_resp]
        if not is_creator and not is_responsible and not is_req_responsible:
            raise PermissionException("只有建立人、負責人或需求負責人可以設定時間")
        start = payload.get("expected_start_date", "")
        end = payload.get("expected_end_date", "")
        if start and not d.expected_start_date:
            d.expected_start_date = start
        if end and not d.expected_end_date:
            d.expected_end_date = end
            d.latest_expected_end_date = end
        d.update_at = CommonTools.get_now()
        dao.commit()
        # 同步需求预计完成时间
        if d.standalone_req_id and end:
            self._sync_req_progress(d.standalone_req_id)
            dao.commit()
        return d.to_dict()

    def delete_duty(self, duty_id: str, work_no: str = None):
        d = dao.find_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        if work_no:
            responsible = json.loads(d.responsible) if d.responsible else []
            resp_lower = [wn.lower() for wn in responsible]
            is_creator = d.creator and d.creator.lower() == work_no.lower()
            is_resp = work_no.lower() in resp_lower
            if not is_creator and not is_resp:
                raise PermissionException("只有建立人或負責人可以刪除任務")
        if d.duty_status not in (0, 1, 8):
            raise BusinessException("當前狀態不允許刪除")
        d.duty_status = 9
        d.update_at = CommonTools.get_now()
        dao.commit()

    def activate_duty(self, duty_id: str, work_no: str, payload: dict = None):
        """草稿 → 進行中（建立人）。可附帶 responsible/expected_start_date/expected_end_date 一起更新"""
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        if d.standalone_req_id:
            raise BusinessException("需求任務需提交主管審核後才可啟動，請點擊「提交審核」")
        responsible = json.loads(d.responsible) if d.responsible else []
        if work_no != d.creator and work_no not in responsible:
            raise PermissionException("只有建立人或負責人可以激活任務")
        if d.duty_status != 0:
            raise BusinessException("僅草稿狀態可激活")
        # 先應用傳入的補充欄位
        if payload:
            if payload.get("responsible"):
                resp = payload["responsible"]
                if isinstance(resp, list):
                    resp = [w.strip().lower() for w in resp if w]
                d.responsible = json.dumps(resp, ensure_ascii=False)
            if payload.get("expected_start_date"):
                d.expected_start_date = payload["expected_start_date"]
            if payload.get("expected_end_date"):
                d.expected_end_date = payload["expected_end_date"]
        # 驗證必填欄位
        responsible = json.loads(d.responsible) if d.responsible else []
        if not responsible:
            raise BusinessException("激活前請先指定負責人")
        if not d.expected_start_date or not d.expected_end_date:
            raise BusinessException("激活前請先設定預計開始和預計完成時間")
        d.duty_status = 1
        d.update_at = CommonTools.get_now()
        dao.commit()
        # 通知负责人（排除激活人本身）
        from controllers.notification_controller import push_notification
        op_nm = dao.get_user_display_name(work_no)
        notif_targets = [w for w in responsible if w != work_no]
        if notif_targets:
            push_notification(
                recipients=notif_targets,
                title="您負責的AR已激活",
                desc=f"「{d.duty_nm}」已開始進行，激活人：{op_nm}",
                link_type="duty",
                link_id=d.id,
            )

    def hold_duty(self, duty_id: str, work_no: str, reason: str = ""):
        """進行中/未開始 → 擱置（需求任務：需求責任人；普通AR：建立人或負責人）"""
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        if d.standalone_req_id:
            req = dao.get_req_by_id(d.standalone_req_id)
            req_responsible = json.loads(req.responsible) if req and req.responsible else []
            if work_no not in req_responsible:
                raise PermissionException("只有需求責任人可以擱置需求任務")
        else:
            responsible = json.loads(d.responsible) if d.responsible else []
            if d.creator != work_no and work_no not in responsible:
                raise PermissionException("只有建立人或負責人可以擱置任務")
        if d.duty_status not in (1, 6):
            raise BusinessException("僅進行中或未開始狀態可擱置")
        d.duty_status = 8
        d.shelve_reason = reason or ""
        d.update_at = CommonTools.get_now()
        dao.commit()

        # 通知建立人（排除操作人本身）
        if d.creator and d.creator != work_no:
            from controllers.notification_controller import push_notification
            op_nm = dao.get_user_display_name(work_no)
            push_notification(
                [d.creator],
                title="您建立的AR已被擱置",
                desc=f"AR「{d.duty_nm}」已被擱置，操作人：{op_nm}",
                link_type="duty",
                link_id=d.id,
            )

    def resume_duty(self, duty_id: str, work_no: str):
        """擱置 → 進行中（需求任務：需求責任人；普通AR：建立人或負責人）"""
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        if d.standalone_req_id:
            req = dao.get_req_by_id(d.standalone_req_id)
            req_responsible = json.loads(req.responsible) if req and req.responsible else []
            if work_no not in req_responsible:
                raise PermissionException("只有需求責任人可以恢復需求任務")
        else:
            responsible = json.loads(d.responsible) if d.responsible else []
            if d.creator != work_no and work_no not in responsible:
                raise PermissionException("只有建立人或負責人可以恢復任務")
        if d.duty_status != 8:
            raise BusinessException("僅擱置狀態可恢復")
        d.duty_status = 1
        d.shelve_reason = None
        d.update_at = CommonTools.get_now()
        dao.commit()

        # 通知建立人（排除操作人本身）
        if d.creator and d.creator != work_no:
            from controllers.notification_controller import push_notification
            op_nm = dao.get_user_display_name(work_no)
            push_notification(
                [d.creator],
                title="您建立的AR已恢復進行中",
                desc=f"AR「{d.duty_nm}」已恢復進行，操作人：{op_nm}",
                link_type="duty",
                link_id=d.id,
            )

    def submit_completion(self, duty_id: str, work_no: str, reviewer: list, submitter_name: str = ""):
        """提交完結審核。
        - 需求任務（有 standalone_req_id）：審核人自動設為需求責任人；若提交人即為需求責任人則直接完結。
        - AR任務：使用傳入的 reviewer 列表。
        """
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        responsible = json.loads(d.responsible) if d.responsible else []
        resp_lower = [wn.lower() for wn in responsible]
        if work_no.lower() not in resp_lower:
            raise PermissionException("只有負責人可以提交完結審核")
        if d.duty_status not in (1, 6):
            raise BusinessException("僅進行中或未開始狀態可提交完結審核")

        now = CommonTools.get_now()

        if d.standalone_req_id:
            # 系統任務：審批人為需求責任人
            req = dao.get_req_by_id(d.standalone_req_id)
            req_responsible = json.loads(req.responsible) if req and req.responsible else []
            other_req_resp = [wn for wn in req_responsible if wn.lower() != work_no.lower()]

            submitter_in_req = work_no.lower() in [wn.lower() for wn in req_responsible]
            task_resp_count = len(responsible)

            if (
                # 需求只有1個責任人且就是提交者
                (len(req_responsible) == 1 and len(other_req_resp) == 0)
                # 需求多責任人 + 任務只有1個責任人 + 該人在需求責任人中
                or (len(req_responsible) > 1 and task_resp_count == 1 and submitter_in_req)
            ):
                # 直接完結
                d.duty_status = 3
                d.end_time = now
                d.update_at = now
                dao.commit()
                DutyController._sync_req_progress(d.standalone_req_id)
                return {"review_id": "", "direct": True}

            # 需要審批 → 使用前端傳入的審核人列表，若為空則預設需求責任人（排除提交者），再回退創建人
            if not reviewer:
                reviewer = other_req_resp if other_req_resp else req_responsible
            if not reviewer:
                reviewer = [d.creator] if d.creator else []
            if not reviewer:
                raise BusinessException("請至少指定一位審核人")
            apply_type = "需求任務完結審核"
            apply_type_code = "duty_complete"
        else:
            # AR任務
            is_creator = work_no.lower() == (d.creator or "").lower()

            if is_creator:
                # 提交人是創建人 → 直接完結
                d.duty_status = 3
                d.end_time = now
                d.update_at = now
                dao.commit()
                return {"review_id": "", "direct": True}

            # 提交人不是創建人 → 使用傳入的審核人列表，預設創建人
            if not reviewer:
                reviewer = [d.creator] if d.creator else []
            if not reviewer:
                raise BusinessException("請至少指定一位審核人")
            apply_type = "AR完結審核"
            apply_type_code = "duty_complete"

        # 取得審核人姓名
        user_map = dao.batch_get_user_map(reviewer + [work_no])
        nodes = [
            {
                "node_id": f"node_{i+1}",
                "order": i + 1,
                "approver": user_map[r.lower()].name if r.lower() in user_map else r,
                "approver_work_no": r,
                "is_countersign": False,
                "status": 0,
                "approved_at": None,
                "comment": None,
            }
            for i, r in enumerate(reviewer)
        ]
        if not submitter_name:
            u = user_map.get(work_no.lower())
            submitter_name = u.name if u else work_no

        review = ReviewApplyModel(
            duty_id=duty_id,
            system_id=d.system_id,
            apply_type=apply_type,
            apply_type_code=apply_type_code,
            submitter=work_no,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer, ensure_ascii=False),
            apply_status=1,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        d.duty_status = 2
        d.update_at = now
        dao.add(review)
        dao.commit()

        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title="您有新的審核申請待處理",
            desc=f"「{d.duty_nm}」{apply_type}，提交人：{submitter_name}",
            link_type="review",
            link_id=review.id,
        )
        return {"review_id": review.id, "direct": False}

    def allocate(self, duty_id: str, payload: dict):
        d = dao.find_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        new_resp = []
        removed_resp = []
        old_resp_snap = []
        if payload.get("responsible"):
            old_resp_snap = json.loads(d.responsible) if d.responsible else []
            new_resp_list = payload["responsible"]
            new_resp = [w for w in new_resp_list if w not in old_resp_snap]
            removed_resp = [w for w in old_resp_snap if w not in new_resp_list]
            d.responsible = json.dumps(new_resp_list, ensure_ascii=False)
        if payload.get("expected_start_date"):
            d.expected_start_date = payload["expected_start_date"]
        if payload.get("expected_end_date"):
            d.expected_end_date = payload["expected_end_date"]
            d.latest_expected_end_date = payload["expected_end_date"]
        d.update_at = CommonTools.get_now()
        dao.commit()
        if new_resp or removed_resp:
            from controllers.notification_controller import push_notification
            # 通知新增负责人
            if new_resp:
                push_notification(
                    recipients=new_resp,
                    title="您已被指定為AR負責人",
                    desc=f"「{d.duty_nm}」已指派您為負責人，請及時跟進。",
                    link_type="duty",
                    link_id=d.id,
                )
            # 通知已有负责人（有新成员加入时）
            existing_resp = [w for w in (payload.get("responsible") or []) if w in old_resp_snap]
            if new_resp and existing_resp:
                push_notification(
                    recipients=existing_resp,
                    title="您負責的任務新增了負責人",
                    desc=f"「{d.duty_nm}」加入了新的負責人，請注意協作。",
                    link_type="duty",
                    link_id=d.id,
                )
            # 通知被移除的负责人
            if removed_resp:
                push_notification(
                    recipients=removed_resp,
                    title="您已被移除AR負責人",
                    desc=f"「{d.duty_nm}」已將您從負責人名單中移除。",
                    link_type="duty",
                    link_id=d.id,
                )

    def set_status(self, duty_id: str, status: int):
        d = dao.find_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        d.duty_status = status
        d.update_at = CommonTools.get_now()
        dao.commit()

    def get_unread_progress_count(self, work_no: str):
        count = dao.count_unread_progress(work_no)
        return {"unread_count": count}

    def get_progress(self, duty_id: str, page=1, size=20):
        q = dao.query_progress(duty_id)
        total = q.count()
        records = q.order_by(DutyProgressRecordModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": [r.to_dict() for r in records],
        }

    def _duty_progress_upload_dir(self, duty_id: str, progress_id: str) -> str:
        import os
        from configs.base import BaseConfig
        base = os.path.abspath(BaseConfig.UPLOAD_DIR)
        path = os.path.join(base, "duty_progress_files", duty_id, progress_id)
        os.makedirs(path, exist_ok=True)
        return path

    def create_progress(self, duty_id: str, payload: dict, submitter: str, files=None):
        import os, uuid as _uuid
        d = dao.find_active_by_id(duty_id)
        if not d:
            raise ResourceNotFoundException(resource_type="AR")
        if d.duty_status not in (1, 6):
            raise BusinessException("只有進行中或未開始的任務才能更新進度")
        responsible = json.loads(d.responsible) if d.responsible else []
        if submitter.lower() not in [w.lower() for w in responsible]:
            raise PermissionException("只有負責人可以更新進度")
        # 未開始 → 進行中（首次更新進度自動啟動）
        if d.duty_status == 6:
            d.duty_status = 1
        progress_id = _uuid.uuid4().hex
        rec = DutyProgressRecordModel(
            id=progress_id,
            duty_id=duty_id,
            progress=payload["progress"],
            progress_record=payload.get("progress_record", ""),
            submitter=submitter,
            cooperator=json.dumps(payload.get("cooperator", []), ensure_ascii=False),
            time_consum=payload.get("time_consum", 0),
            is_overtime=str(payload.get("is_overtime", "")).lower() in ("true", "1", "yes"),
            overtime_hours=float(payload.get("overtime_hours", 0) or 0),
            start_time=payload.get("start_time", ""),
        )
        if files:
            from configs.base import BaseConfig
            from utils.exceptions import ValidationException
            saved = []
            upload_list = files.getlist("files") if hasattr(files, "getlist") else []
            for f_obj in upload_list:
                if not f_obj or not f_obj.filename:
                    continue
                ext = f_obj.filename.rsplit(".", 1)[-1].lower() if "." in f_obj.filename else ""
                if ext not in BaseConfig.UPLOAD_ALLOWED_EXTENSIONS:
                    raise ValidationException(msg=f"不支持的文件类型: .{ext}")
                fid = _uuid.uuid4().hex
                dest_dir = self._duty_progress_upload_dir(duty_id, progress_id)
                dest = os.path.join(dest_dir, f"{fid}.{ext}" if ext else fid)
                f_obj.save(dest)
                saved.append({"id": fid, "name": f_obj.filename, "ext": ext, "size": os.path.getsize(dest)})
            if saved:
                rec.files_json = json.dumps(saved, ensure_ascii=False)
        dao.add(rec)
        d.progress = payload["progress"]
        d.update_at = CommonTools.get_now()
        dao.commit()
        # 同步需求进度（如属于需求任务）
        if d.standalone_req_id:
            self._sync_req_progress(d.standalone_req_id)
            dao.commit()

    def get_review_list(self, page=1, size=20, work_no=None):
        from controllers.project_controller import ProjectController
        proj_ctrl = ProjectController()
        q = dao.query_duty_reviews(work_no)
        total = q.count()
        records = q.order_by(ReviewApplyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": proj_ctrl._batch_enrich_reviews(records, viewer_work_no=work_no or ""),
        }

    def approve_review(self, review_id: str, status: int, reject_reason: str = "",
                       countersigns: list = None):
        r = dao.find_review_by_id(review_id)
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")

        now = CommonTools.get_now()

        node_status_map = {2: 1, 3: 2, 4: 3}
        nodes = json.loads(r.approval_nodes_json) if r.approval_nodes_json else []
        # 兼容旧数据：approval_nodes_json 为空时，从 reviewer 字段重建节点
        if not nodes and r.reviewer:
            try:
                reviewers = json.loads(r.reviewer) if isinstance(r.reviewer, str) else r.reviewer
                if isinstance(reviewers, str):
                    reviewers = [reviewers]
            except Exception:
                reviewers = []
            for i, wk in enumerate(reviewers if isinstance(reviewers, list) else []):
                nodes.append({
                    "node_id": f"legacy_{i}",
                    "order": i + 1,
                    "approver": wk,
                    "approver_work_no": wk,
                    "status": 0,
                    "is_countersign": False,
                    "approved_at": None,
                    "comment": None,
                })
        approved_order = None
        for node in sorted(nodes, key=lambda n: n.get("order", 0)):
            if node.get("status") == 0:
                node["status"]      = node_status_map.get(status, status)
                node["approved_at"] = now
                node["comment"]     = reject_reason or ""
                approved_order      = node.get("order", 0)
                break

        # 通過時若有加簽人列表，依序插入加簽節點（在剛審批的節點之後）
        cs_list = countersigns or []
        if status == 2 and cs_list and approved_order is not None:
            n_new = len(cs_list)
            insert_start = approved_order + 1
            for n in nodes:
                if n.get("order", 0) >= insert_start:
                    n["order"] = n.get("order", 0) + n_new
            for i, cs in enumerate(cs_list):
                nodes.append({
                    "node_id":          f"{CommonTools.get_now().replace(' ', '')}_{i}",
                    "order":            insert_start + i,
                    "approver":         cs.get("name", "") or cs.get("work_no", ""),
                    "approver_work_no": cs.get("work_no", ""),
                    "is_countersign":   True,
                    "status":           0,
                    "approved_at":      None,
                    "comment":          None,
                })

        r.approval_nodes_json = json.dumps(nodes, ensure_ascii=False)

        all_approved = bool(nodes) and all(n.get("status") == 1 for n in nodes)

        if status in (3, 4):
            final_status = status
        elif all_approved:
            final_status = 2
        else:
            # 还有待审节点，保持待审状态
            r.update_at = now
            dao.commit()
            return

        r.apply_status = final_status
        r.update_at = now

        d = None
        if r.duty_id:
            d = dao.find_by_id(r.duty_id)
            if d:
                if final_status == 2:
                    d.duty_status = 3  # 已完結
                    d.end_time = now
                    d.update_at = now
                elif final_status in (3, 4):
                    d.duty_status = 1  # 退回進行中
                    d.update_at = now
        dao.commit()

        # 通知提交人（負責人）審批結果
        if r.duty_id and d and r.submitter:
            from controllers.notification_controller import push_notification
            approver_node = next(
                (n for n in sorted(
                    json.loads(r.approval_nodes_json) if r.approval_nodes_json else [],
                    key=lambda n: n.get("order", 0), reverse=True
                ) if n.get("status") != 0),
                None,
            )
            approver_nm = approver_node["approver"] if approver_node else ""
            result_text = "已通過，任務完結" if final_status == 2 else ("已被退回，請繼續跟進" if final_status in (3, 4) else "")
            if result_text:
                push_notification(
                    [r.submitter],
                    title=f"您的AR完結審核{result_text.split('，')[0]}",
                    desc=f"AR「{d.duty_nm}」完結審核{result_text}，審核人：{approver_nm}",
                    link_type="duty",
                    link_id=d.id,
                )

    def countersign_review(self, review_id: str, approver_work_no: str, approver_name: str):
        r = dao.find_review_by_id(review_id)
        if not r:
            raise ResourceNotFoundException(resource_type="审核记录")
        nodes = json.loads(r.approval_nodes_json) if r.approval_nodes_json else []
        # 兼容旧数据：补全缺失的 order 字段
        missing = [n for n in nodes if "order" not in n]
        if missing:
            max_order = max((n.get("order", 0) for n in nodes if "order" in n), default=0)
            for n in missing:
                max_order += 1
                n["order"] = max_order
        current_order = next(
            (n["order"] for n in sorted(nodes, key=lambda n: n["order"]) if n.get("status") == 0),
            max((n["order"] for n in nodes), default=0),
        )
        insert_order = current_order + 1
        for n in nodes:
            if n["order"] >= insert_order:
                n["order"] += 1
        nodes.append({
            "node_id": CommonTools.get_now().replace(" ", ""),
            "order": insert_order,
            "approver": approver_name,
            "approver_work_no": approver_work_no,
            "is_countersign": True,
            "status": 0,
            "approved_at": None,
            "comment": None,
        })
        r.approval_nodes_json = json.dumps(nodes, ensure_ascii=False)
        r.update_at = CommonTools.get_now()
        dao.commit()

    def get_task_list(self, work_no: str, page=1, size=20):
        q = dao.query_task_list(work_no)
        total = q.count()
        duties = q.order_by(TemporaryDutyModel.created_at.desc()).offset((page-1)*size).limit(size).all()
        enriched = dao.enrich_duty_list(duties)
        return {
            "total_count": total,
            "total_page": (total + size - 1) // size,
            "data_list": enriched,
        }
