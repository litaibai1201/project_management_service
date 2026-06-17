#!/usr/bin/env python3
"""
一次性脚本：刷新所有需求的 expected_end_date，
使其等于关联任务中最晚的预计完成时间。

用法：
  cd pm_service
  python scripts/fix_req_dates.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def run():
    from dbs.mysql_db import db
    from tables.function_table import FunctionDataModel
    from tables.duty_table import TemporaryDutyModel
    from dbs.mysql_db.model_tables import RequirementModel
    from tables.standalone_req_table import StandaloneReqModel

    # ── 调试：先看看任务和需求的关联情况 ──────────────────────────
    print("=== 调试信息 ===")
    all_funcs = db.session.query(FunctionDataModel).filter(
        FunctionDataModel.function_status != 9
    ).all()
    funcs_with_req = [f for f in all_funcs if f.requirement_id]
    funcs_with_date = [f for f in all_funcs if f.expected_end_date]
    print(f"  总任务数: {len(all_funcs)}")
    print(f"  有 requirement_id 的任务: {len(funcs_with_req)}")
    print(f"  有 expected_end_date 的任务: {len(funcs_with_date)}")
    print(f"  同时有 requirement_id + expected_end_date: {len([f for f in all_funcs if f.requirement_id and f.expected_end_date])}")

    # 显示前几条任务的关联情况
    for f in all_funcs[:5]:
        print(f"    任务[{f.function_nm}] req_id={f.requirement_id or 'NULL'} end_date={f.expected_end_date or 'NULL'} project_id={f.project_id}")

    # ── 专案需求 ──────────────────────────────────────────────
    print("\n=== 专案需求 ===")
    reqs = db.session.query(RequirementModel).filter(RequirementModel.req_status != 9).all()
    updated = 0
    for req in reqs:
        funcs = db.session.query(FunctionDataModel).filter(
            FunctionDataModel.requirement_id == req.id,
            FunctionDataModel.function_status != 9,
        ).all()
        end_dates = [f.expected_end_date for f in funcs if f.expected_end_date]
        if funcs or end_dates:
            print(f"  需求[{req.req_nm}] id={req.id} 当前end={req.expected_end_date} 关联任务={len(funcs)} 有日期的={len(end_dates)}")
        if not end_dates:
            continue
        new_end = max(end_dates)
        if req.expected_end_date != new_end:
            print(f"    -> 更新: {req.expected_end_date} -> {new_end}")
            req.expected_end_date = new_end
            updated += 1
    print(f"  更新了 {updated}/{len(reqs)} 条专案需求")

    # ── 系统需求 ──────────────────────────────────────────────
    print("\n=== 系统需求 ===")
    sreqs = db.session.query(StandaloneReqModel).filter(StandaloneReqModel.req_status != 9).all()
    updated2 = 0
    for req in sreqs:
        duties = db.session.query(TemporaryDutyModel).filter(
            TemporaryDutyModel.standalone_req_id == req.id,
            TemporaryDutyModel.duty_status != 9,
        ).all()
        end_dates = [
            d.latest_expected_end_date or d.expected_end_date
            for d in duties if d.expected_end_date
        ]
        if duties or end_dates:
            print(f"  需求[{req.req_nm}] id={req.id} 当前end={req.expected_end_date} 关联任务={len(duties)} 有日期的={len(end_dates)}")
        if not end_dates:
            continue
        new_end = max(end_dates)
        if req.expected_end_date != new_end:
            print(f"    -> 更新: {req.expected_end_date} -> {new_end}")
            req.expected_end_date = new_end
            updated2 += 1
    print(f"  更新了 {updated2}/{len(sreqs)} 条系统需求")

    db.session.commit()
    print(f"\n完成！共更新 {updated + updated2} 条需求")


if __name__ == "__main__":
    from app import create_app
    app = create_app()
    with app.app_context():
        run()
else:
    # flask shell 模式
    run()
