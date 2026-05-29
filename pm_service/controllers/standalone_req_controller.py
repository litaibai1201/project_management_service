# -*- coding: utf-8 -*-
"""独立需求控制器"""
import json
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import StandaloneReqModel, UserProfileModel, SystemModel
from utils.tools import CommonTools


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

        creator_nos = {r.creator for r in items if r.creator}
        name_map = {}
        if creator_nos:
            users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
                UserProfileModel.work_no.in_(creator_nos)
            ).all()
            name_map = {u.work_no: u.name for u in users}

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
            d["creator_nm"] = name_map.get(r.creator, r.creator or "")
            d["system_nm"]  = sys_map.get(r.system_id, "")
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
        )
        db.session.add(r)
        db.session.commit()
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
        r.updated_at = CommonTools.get_now()
        db.session.commit()
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

        base_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
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
        base_dir = current_app.config.get("UPLOAD_FOLDER", "uploads")
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
