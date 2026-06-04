# -*- coding: utf-8 -*-
"""独立需求控制器"""
import json
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import StandaloneReqModel, UserProfileModel, SystemModel, ReviewApplyModel
import os
from configs.base import BaseConfig
from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, BusinessException


class StandaloneReqController:

    def list_reqs(self, payload: dict, work_no: str = None):
        keyword    = payload.get("keyword", "")
        status     = payload.get("status")
        priority   = payload.get("priority")
        responsible = payload.get("responsible", "")
        page       = int(payload.get("page", 1))
        size       = int(payload.get("size", 20))

        system_id  = payload.get("system_id")

        q = db.session.query(StandaloneReqModel).filter(StandaloneReqModel.req_status != 9)
        if keyword:
            q = q.filter(StandaloneReqModel.req_nm.like(f"%{keyword}%"))
        if status is not None:
            q = q.filter(StandaloneReqModel.req_status == status)
        if priority is not None:
            q = q.filter(StandaloneReqModel.priority == priority)
        if responsible:
            q = q.filter(StandaloneReqModel.responsible.like(f"%{responsible}%"))
        if system_id:
            q = q.filter(StandaloneReqModel.system_id == system_id)

        total = q.count()
        items = q.order_by(StandaloneReqModel.created_at.desc()).offset((page - 1) * size).limit(size).all()

        work_nos = {r.creator for r in items if r.creator} | {r.reviewer for r in items if r.reviewer}
        name_map = {}
        if work_nos:
            users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
                db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in work_nos])
            ).all()
            name_map = {u.work_no.lower(): u.name for u in users}

        sys_ids = {r.system_id for r in items if r.system_id}
        sys_map = {}
        if sys_ids:
            systems = db.session.query(SystemModel.id, SystemModel.sys_nm).filter(
                SystemModel.id.in_(sys_ids)
            ).all()
            sys_map = {s.id: s.sys_nm for s in systems}

        data = []
        for r in items:
            d = r.to_dict()
            d["creator_nm"]  = name_map.get((r.creator or "").lower(), r.creator or "")
            d["reviewer_nm"] = name_map.get((r.reviewer or "").lower(), r.reviewer or "") if r.reviewer else ""
            d["system_nm"]   = sys_map.get(r.system_id, "")
            data.append(d)

        return {"data_list": data, "total_count": total, "page": page, "size": size}

    def create_req(self, payload: dict, creator: str):
        resp = payload.get("responsible", [])
        if isinstance(resp, str):
            try:
                resp = json.loads(resp)
            except Exception:
                resp = []
        r = StandaloneReqModel(
            req_nm=payload["req_nm"],
            describe=payload.get("describe", ""),
            priority=int(payload.get("priority", 2)),
            system_id=payload.get("system_id", ""),
            creator=creator,
            responsible=json.dumps(resp, ensure_ascii=False),
            expected_end_date=payload.get("expected_end_date", ""),
            expected_benefit=payload.get("expected_benefit", ""),
            benefit_amount=payload.get("benefit_amount"),
            benefit_unit=payload.get("benefit_unit", "元/年"),
        )
        db.session.add(r)
        db.session.commit()

        # 通知非建立人的負責人
        notif_targets = [w for w in resp if w != creator]
        if notif_targets:
            from controllers.notification_controller import push_notification
            sys_obj = db.session.query(SystemModel).filter_by(id=r.system_id).first() if r.system_id else None
            sys_nm = sys_obj.sys_nm if sys_obj else ""
            creator_u = db.session.query(UserProfileModel).filter(db.func.lower(UserProfileModel.work_no) == (creator or "").lower()).first()
            creator_nm = creator_u.name if creator_u else creator
            push_notification(
                notif_targets,
                title="您被指定為系統需求負責人",
                desc=f"【{sys_nm}】需求「{r.req_nm}」，建立人：{creator_nm}" if sys_nm else f"需求「{r.req_nm}」，建立人：{creator_nm}",
                link_type="standalone_req",
                link_id=r.id,
            )

        return r.to_dict()

    def update_req(self, req_id: str, payload: dict, work_no: str):
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(resource_type="需求")

        if "req_nm" in payload:
            r.req_nm = payload["req_nm"]
        if "describe" in payload:
            r.describe = payload["describe"]
        if "priority" in payload:
            r.priority = int(payload["priority"])
        old_status = r.req_status
        if "status" in payload:
            r.req_status = int(payload["status"])
        if "responsible" in payload:
            resp = payload["responsible"]
            if isinstance(resp, str):
                try:
                    resp = json.loads(resp)
                except Exception:
                    resp = []
            r.responsible = json.dumps(resp, ensure_ascii=False)
        if "system_id" in payload:
            r.system_id = payload["system_id"]
        if "expected_end_date" in payload:
            r.expected_end_date = payload["expected_end_date"]
        if "expected_benefit" in payload:
            r.expected_benefit = payload["expected_benefit"]
        if "benefit_amount" in payload:
            r.benefit_amount = payload["benefit_amount"]
        if "benefit_unit" in payload:
            r.benefit_unit = payload["benefit_unit"]
        r.updated_at = CommonTools.get_now()
        db.session.commit()

        # 狀態變為進行中(2)或完結(4)時通知負責人
        new_status = r.req_status
        if new_status != old_status and new_status in (2, 4):
            resp = []
            if r.responsible:
                try:
                    resp = json.loads(r.responsible)
                except Exception:
                    pass
            notif_targets = [w for w in resp if w != work_no]
            if notif_targets:
                from controllers.notification_controller import push_notification
                sys_obj = db.session.query(SystemModel).filter_by(id=r.system_id).first() if r.system_id else None
                sys_nm = sys_obj.sys_nm if sys_obj else ""
                operator_u = db.session.query(UserProfileModel).filter(db.func.lower(UserProfileModel.work_no) == (work_no or "").lower()).first()
                operator_nm = operator_u.name if operator_u else work_no
                status_label = "進行中" if new_status == 2 else "已完結"
                push_notification(
                    notif_targets,
                    title=f"系統需求狀態已更新為「{status_label}」",
                    desc=f"【{sys_nm}】需求「{r.req_nm}」已更新為{status_label}，操作人：{operator_nm}" if sys_nm else f"需求「{r.req_nm}」已更新為{status_label}，操作人：{operator_nm}",
                    link_type="standalone_req",
                    link_id=r.id,
                )

        return r.to_dict()

    def delete_req(self, req_id: str, work_no: str):
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            from utils.exceptions import ResourceNotFoundException
            raise ResourceNotFoundException(resource_type="需求")
        r.req_status = 9
        r.updated_at = CommonTools.get_now()
        db.session.commit()
        return True

    # ── 審核流程 ────────────────────────────────────────────────────────────────

    def _build_approval_nodes(self, reviewer: list, user_map: dict) -> list:
        """構建審批節點列表"""
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
        return nodes

    def submit_review(self, req_id: str, payload: dict, work_no: str):
        """提交審核：草稿(0) → 審核中(1)，reviewer 可以是 str 或 list"""
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status != 0:
            raise BusinessException(msg="只有草稿狀態的需求才能提交審核")
        reviewer = payload.get("reviewer", [])
        if isinstance(reviewer, str):
            reviewer = [reviewer] if reviewer else []
        if not reviewer:
            raise BusinessException(msg="請選擇審核人")

        all_wks = list({work_no} | set(reviewer))
        user_map = {
            u.work_no.lower(): u
            for u in db.session.query(UserProfileModel).filter(
                db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in all_wks])
            ).all()
        }
        nodes = self._build_approval_nodes(reviewer, user_map)
        submitter_profile = user_map.get(work_no.lower())
        submitter_name = submitter_profile.name if submitter_profile else work_no

        # 取得系統名稱作為申請描述
        sys = db.session.query(SystemModel).filter_by(id=r.system_id).first()
        sys_nm = sys.sys_nm if sys else ""
        desc = f"[{sys_nm}] {r.req_nm}" if sys_nm else r.req_nm

        apply = ReviewApplyModel(
            requirement_id=req_id,
            system_id=r.system_id,
            apply_type="系統需求審核",
            apply_type_code="standalone_req_review",
            submitter=work_no,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer, ensure_ascii=False),
            priority=r.priority,
            description=desc,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        db.session.add(apply)

        r.req_status = 1
        r.reviewer = reviewer[0]
        r.reviewer_chain_json = json.dumps(reviewer, ensure_ascii=False)
        r.updated_at = CommonTools.get_now()
        db.session.commit()

        # 通知第一位審核人
        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title="您有新的系統需求審核待處理",
            desc=f"系統需求「{r.req_nm}」已提交審核，請及時處理。",
            link_type="review",
            link_id=apply.id,
        )
        return r.to_dict()

    def batch_submit_review(self, payload: dict, work_no: str):
        """批量提交審核：多筆草稿需求統一使用同一審核鏈"""
        req_ids = payload.get("req_ids", [])
        reviewer = payload.get("reviewer", [])
        if isinstance(reviewer, str):
            reviewer = [reviewer] if reviewer else []
        if not req_ids:
            raise BusinessException(msg="請選擇需求")
        if not reviewer:
            raise BusinessException(msg="請選擇審核人")

        reqs = db.session.query(StandaloneReqModel).filter(
            StandaloneReqModel.id.in_(req_ids),
            StandaloneReqModel.req_status == 0,
        ).all()
        if not reqs:
            raise BusinessException(msg="選中的需求均不在草稿狀態")

        all_wks = list({work_no} | set(reviewer))
        user_map = {
            u.work_no.lower(): u
            for u in db.session.query(UserProfileModel).filter(
                db.func.lower(UserProfileModel.work_no).in_([w.lower() for w in all_wks])
            ).all()
        }
        nodes = self._build_approval_nodes(reviewer, user_map)
        submitter_profile = user_map.get(work_no.lower())
        submitter_name = submitter_profile.name if submitter_profile else work_no
        desc = "、".join(r.req_nm for r in reqs)
        reviewer_chain_json = json.dumps(reviewer, ensure_ascii=False)

        # 取得系統ID（批量時所有需求應屬同一系統）
        system_id = reqs[0].system_id if reqs else None
        apply = ReviewApplyModel(
            requirement_ids_json=json.dumps([r.id for r in reqs], ensure_ascii=False),
            system_id=system_id,
            apply_type="系統需求批量審核",
            apply_type_code="standalone_req_batch_review",
            submitter=work_no,
            submitter_name=submitter_name,
            reviewer=reviewer_chain_json,
            priority=max((r.priority for r in reqs), default=2),
            description=desc,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        db.session.add(apply)

        now = CommonTools.get_now()
        for r in reqs:
            r.req_status = 1
            r.reviewer = reviewer[0]
            r.reviewer_chain_json = reviewer_chain_json
            r.updated_at = now
        db.session.commit()

        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title="您有新的系統需求批量審核待處理",
            desc=f"{len(reqs)} 條系統需求已批量提交審核，請及時處理。",
            link_type="review",
            link_id=apply.id,
        )
        return {"updated": [r.id for r in reqs], "count": len(reqs)}

    def review_result(self, req_id: str, payload: dict, work_no: str):
        """審核結果：審核中(1) → 進行中(2) 或 已拒絕(3)"""
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status != 1:
            raise BusinessException(msg="只有審核中的需求才能進行審核操作")
        action = payload.get("action", "")
        if action == "approve":
            r.req_status = 2
        elif action == "reject":
            r.req_status = 3
        else:
            raise BusinessException(msg="無效的操作類型")
        r.updated_at = CommonTools.get_now()
        db.session.commit()
        return r.to_dict()

    # ── 文件管理 ────────────────────────────────────────────────────────────────

    def upload_file(self, req_id: str, file, uploader: str):
        import os
        from flask import current_app
        from dbs.mysql_db.model_tables import generate_uuid
        from utils.exceptions import BusinessException, ResourceNotFoundException
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
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
        upload_dir = os.path.join(base_dir, "standalone_req", req_id)
        os.makedirs(upload_dir, exist_ok=True)

        file_id = generate_uuid()
        stored_name = f"{file_id}.{ext}"
        abs_path = os.path.join(upload_dir, stored_name)
        file.save(abs_path)
        size = os.path.getsize(abs_path)

        rel_url = f"/api/standalone_req/{req_id}/files/{file_id}/preview"
        file_info = {"name": filename, "url": rel_url, "size": size, "file_id": file_id}

        files = []
        if r.files_json:
            try:
                files = json.loads(r.files_json)
            except Exception:
                pass
        files.append(file_info)
        r.files_json = json.dumps(files, ensure_ascii=False)
        r.updated_at = CommonTools.get_now()
        db.session.commit()
        return {"files": files, "file": file_info}

    def get_file_path(self, req_id: str, file_id: str):
        import os
        from flask import current_app
        from utils.exceptions import ResourceNotFoundException
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
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
        ext = file_info["name"].rsplit(".", 1)[-1] if "." in file_info["name"] else "bin"
        abs_path = os.path.join(base_dir, "standalone_req", req_id, f"{file_id}.{ext}")
        return abs_path, file_info["name"]

    def remove_file(self, req_id: str, file_id: str):
        from utils.exceptions import ResourceNotFoundException
        r = db.session.query(StandaloneReqModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        files = []
        if r.files_json:
            try:
                files = json.loads(r.files_json)
            except Exception:
                pass
        files = [f for f in files if f.get("file_id") != file_id]
        r.files_json = json.dumps(files, ensure_ascii=False)
        r.updated_at = CommonTools.get_now()
        db.session.commit()
        return files
