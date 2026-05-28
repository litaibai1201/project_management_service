# -*- coding: utf-8 -*-
"""独立需求控制器"""
import json
from dbs.mysql_db import db
from dbs.mysql_db.model_tables import StandaloneReqModel, UserProfileModel
from utils.tools import CommonTools


class StandaloneReqController:

    def list_reqs(self, payload: dict, work_no: str = None):
        keyword    = payload.get("keyword", "")
        status     = payload.get("status")
        priority   = payload.get("priority")
        responsible = payload.get("responsible", "")
        page       = int(payload.get("page", 1))
        size       = int(payload.get("size", 20))

        q = db.session.query(StandaloneReqModel).filter(StandaloneReqModel.req_status != 9)
        if keyword:
            q = q.filter(StandaloneReqModel.req_nm.like(f"%{keyword}%"))
        if status is not None:
            q = q.filter(StandaloneReqModel.req_status == status)
        if priority is not None:
            q = q.filter(StandaloneReqModel.priority == priority)
        if responsible:
            q = q.filter(StandaloneReqModel.responsible.like(f"%{responsible}%"))

        total = q.count()
        items = q.order_by(StandaloneReqModel.created_at.desc()).offset((page - 1) * size).limit(size).all()

        creator_nos = {r.creator for r in items if r.creator}
        name_map = {}
        if creator_nos:
            users = db.session.query(UserProfileModel.work_no, UserProfileModel.name).filter(
                UserProfileModel.work_no.in_(creator_nos)
            ).all()
            name_map = {u.work_no: u.name for u in users}

        data = []
        for r in items:
            d = r.to_dict()
            d["creator_nm"] = name_map.get(r.creator, r.creator or "")
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
