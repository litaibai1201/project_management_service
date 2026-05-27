# -*- coding: utf-8 -*-
"""需求控制器"""
import json

from utils.tools import CommonTools
from utils.exceptions import ResourceNotFoundException, BusinessException, PermissionException
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import (
    RequirementModel, ProjectDataModel, ReviewApplyModel, UserProfileModel,
)


class RequirementController:

    # ── 列表 ────────────────────────────────────────────────────────────────────

    def get_requirements(self, project_id: str):
        """获取专案下所有未删除的需求"""
        reqs = (
            db.session.query(RequirementModel)
            .filter_by(project_id=project_id)
            .filter(RequirementModel.req_status != 9)
            .order_by(RequirementModel.created_at.asc())
            .all()
        )
        # 补充创建人姓名
        creator_nos = {r.creator for r in reqs if r.creator}
        name_map = {}
        if creator_nos:
            users = db.session.query(UserProfileModel).filter(
                UserProfileModel.work_no.in_(creator_nos)
            ).all()
            name_map = {u.work_no: u.name for u in users}

        result = []
        for r in reqs:
            d = r.to_dict()
            d["creator_nm"] = name_map.get(r.creator, r.creator or "")
            result.append(d)
        return result

    # ── 详情 ────────────────────────────────────────────────────────────────────

    def get_requirement(self, req_id: str):
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        u = db.session.query(UserProfileModel).filter_by(work_no=r.creator).first()
        d = r.to_dict()
        d["creator_nm"] = u.name if u else (r.creator or "")
        return d

    # ── 新建 ────────────────────────────────────────────────────────────────────

    def create_requirement(self, project_id: str, payload: dict, creator: str):
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
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

        req = RequirementModel(
            project_id=project_id,
            req_nm=payload["req_nm"],
            describe=payload.get("describe", ""),
            priority=payload.get("priority", 2),
            creator=creator,
            expected_benefit=payload.get("expected_benefit", ""),
            benefit_amount=payload.get("benefit_amount"),
            benefit_unit=payload.get("benefit_unit", "元/年"),
            files_json=json.dumps(payload.get("files", []), ensure_ascii=False),
            expected_end_date=payload.get("expected_end_date", ""),
        )
        db.session.add(req)
        db.session.commit()
        return req.to_dict()

    # ── 更新 ────────────────────────────────────────────────────────────────────

    def update_requirement(self, req_id: str, payload: dict, operator: str):
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        # 只有草稿狀態的需求可以修改，專案必須在草稿或執行中階段
        if r.req_status != 0:
            raise PermissionException(msg="只有草稿狀態的需求可以修改")
        p = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
        if not p or p.project_status not in (1, 5):
            raise PermissionException(msg="只有草稿或執行中階段的專案才能修改需求")

        for field in ("req_nm", "describe", "priority", "expected_benefit",
                      "benefit_amount", "benefit_unit", "expected_end_date"):
            if field in payload and payload[field] is not None:
                setattr(r, field, payload[field])
        if "files" in payload:
            r.files_json = json.dumps(payload["files"], ensure_ascii=False)
        r.update_at = CommonTools.get_now()
        db.session.commit()
        return r.to_dict()

    # ── 删除 ────────────────────────────────────────────────────────────────────

    def delete_requirement(self, req_id: str, operator: str):
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status != 0:
            raise PermissionException(msg="只有草稿狀態的需求可以刪除")
        p = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
        if not p or p.project_status not in (1, 5):
            raise PermissionException(msg="只有草稿或執行中階段的專案才能刪除需求")
        r.req_status = 9
        r.update_at = CommonTools.get_now()
        db.session.commit()

    # ── 提交审核 ────────────────────────────────────────────────────────────────

    def submit_review(self, req_id: str, reviewer: list, operator: str):
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status == 1:
            raise PermissionException(msg="需求已在审核中")
        if r.req_status == 2:
            raise PermissionException(msg="需求已通过审核")

        p = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
        # 只有執行中的專案才能提交需求審核（規劃/排程階段的需求隨排程審核一起通過）
        if not p or p.project_status != 5:
            raise PermissionException(msg="只有執行中的專案才能提交需求審核，規劃排程阶段的需求將隨排程審核自動通過")
        operator = (operator or "").strip().lower()
        reviewer = [(w or "").strip().lower() for w in reviewer if w]

        # 构建审批节点
        nodes = []
        for i, wk in enumerate(reviewer):
            u = db.session.query(UserProfileModel).filter_by(work_no=wk).first()
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

        submitter_profile = db.session.query(UserProfileModel).filter_by(work_no=operator).first()
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
        db.session.add(apply)
        r.req_status = 1
        r.update_at = CommonTools.get_now()
        db.session.commit()

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
        p = db.session.query(ProjectDataModel).filter_by(id=project_id).first()
        if not p or p.project_status != 5:
            raise PermissionException(msg="只有執行中的專案才能提交需求審核")
        operator = (operator or "").strip().lower()
        if operator != (p.product_pm or "").strip().lower():
            raise PermissionException(msg="只有產品PM可以提交需求審核")

        reqs = []
        for req_id in requirement_ids:
            r = db.session.query(RequirementModel).filter_by(id=req_id).first()
            if not r or r.req_status == 9:
                raise ResourceNotFoundException(resource_type="需求")
            if r.req_status != 0:
                raise PermissionException(msg=f"需求「{r.req_nm}」不在草稿狀態，無法提交審核")
            reqs.append(r)

        reviewer = [(w or "").strip().lower() for w in reviewer if w]
        nodes = []
        for i, wk in enumerate(reviewer):
            u = db.session.query(UserProfileModel).filter_by(work_no=wk).first()
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

        submitter_profile = db.session.query(UserProfileModel).filter_by(work_no=operator).first()
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
        db.session.add(apply)
        for r in reqs:
            r.req_status = 1
            r.update_at = CommonTools.get_now()
        db.session.commit()

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

    # ── 提交搁置审核 ─────────────────────────────────────────────────────────────

    def submit_shelve(self, req_id: str, reviewer: list, operator: str):
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
        if not r or r.req_status == 9:
            raise ResourceNotFoundException(resource_type="需求")
        if r.req_status != 2:
            raise PermissionException(msg="只有已通過的需求才能申請搁置")

        from dbs.mysql_db.model_tables import ReviewApplyModel as _ReviewApply
        # 检查是否已有待审的搁置申请
        pending = (
            db.session.query(_ReviewApply)
            .filter_by(requirement_id=req_id, apply_type_code="requirement_shelve")
            .filter(_ReviewApply.status == 1)
            .first()
        )
        if pending:
            raise PermissionException(msg="已有搁置審核申請待審，請勿重複提交")

        p = db.session.query(ProjectDataModel).filter_by(id=r.project_id).first()
        operator = (operator or "").strip().lower()
        reviewer = [(w or "").strip().lower() for w in reviewer if w]

        nodes = []
        for i, wk in enumerate(reviewer):
            u = db.session.query(UserProfileModel).filter_by(work_no=wk).first()
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

        submitter_profile = db.session.query(UserProfileModel).filter_by(work_no=operator).first()
        submitter_name = submitter_profile.name if submitter_profile else operator

        apply = ReviewApplyModel(
            project_id=r.project_id,
            requirement_id=req_id,
            apply_type="需求搁置",
            apply_type_code="requirement_shelve",
            submitter=operator,
            submitter_name=submitter_name,
            reviewer=json.dumps(reviewer),
            priority=r.priority,
            description=r.req_nm,
            approval_nodes_json=json.dumps(nodes, ensure_ascii=False),
        )
        db.session.add(apply)
        r.update_at = CommonTools.get_now()
        db.session.commit()

        from controllers.notification_controller import push_notification
        first_reviewers = [n["approver_work_no"] for n in nodes if n.get("order") == 1]
        push_notification(
            first_reviewers,
            title="您有新的需求搁置申請待處理",
            desc=f"專案「{p.project_nm if p else ''}」的需求「{r.req_nm}」申請搁置，請及時處理。",
            link_type="review",
            link_id=apply.id,
        )
        return apply.to_dict()

    # ── 文件管理 ────────────────────────────────────────────────────────────────

    def upload_file(self, req_id: str, file, uploader: str):
        """上传需求附件，保存到本地并记录到 files_json"""
        import os
        from flask import current_app
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
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

        base_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
        upload_dir = os.path.join(base_dir, "requirements", req_id)
        os.makedirs(upload_dir, exist_ok=True)

        from dbs.mysql_db.model_tables import generate_uuid
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
        db.session.commit()
        return {"files": files, "file": file_info}

    def get_req_file_path(self, req_id: str, file_id: str):
        """返回 (abs_path, original_name)，用于预览/下载"""
        import os
        from flask import current_app
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
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
        base_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
        stored_url = file_info["url"]  # /uploads/requirements/{req_id}/{file_id}.ext
        rel_path = stored_url.lstrip("/")
        abs_path = os.path.join(os.path.dirname(base_dir), rel_path) if not os.path.isabs(base_dir) else stored_url
        # 重新从 base_dir 解析绝对路径
        ext = file_info["name"].rsplit(".", 1)[-1] if "." in file_info["name"] else "bin"
        abs_path = os.path.join(base_dir, "requirements", req_id, f"{file_id}.{ext}")
        return abs_path, file_info["name"]

    def remove_file(self, req_id: str, file_url: str):
        """从需求附件列表删除指定文件记录"""
        r = db.session.query(RequirementModel).filter_by(id=req_id).first()
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
        db.session.commit()
        return files
