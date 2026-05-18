# -*- coding: utf-8 -*-
"""
@文件: dingtalk_tasks.py
@说明: 钉钉个人消息推送 Celery 异步任务
       调用第三方 POST /api/sendSingleAlarm 接口
       所有推送结果均记录日志，失败不影响主业务
"""

import json
import requests

from queues.celery_queue import celery_app
from loggers import logger


def _get_dingtalk_cfg():
    """从 Flask app.config 读取钉钉配置，在任务上下文中调用"""
    try:
        from flask import current_app
        cfg = current_app.config
        return {
            "base":             cfg.get("DINGTALK_API_BASE", ""),
            "service_name":     cfg.get("DINGTALK_SERVICE_NAME", ""),
            "service_type":     cfg.get("DINGTALK_SERVICE_TYPE", "Web"),
            "token":            cfg.get("DINGTALK_TOKEN", ""),
            "same_alarm_inter": int(cfg.get("DINGTALK_SAME_ALARM_INTER", 5)),
        }
    except Exception:
        return {}


@celery_app.app.task(
    name="tasks.dingtalk.send_notification",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def send_dingtalk_notification(self, recipients: list, title: str, desc: str = "") -> dict:
    """
    异步推送钉钉个人消息（markdown 格式）。

    Args:
        recipients: 工号列表（与钉钉用户 ID 对应）
        title:      消息标题
        desc:       消息详情（可为空）

    Returns:
        {"status": "ok"|"skipped"|"error", "detail": ...}
    """
    cfg = _get_dingtalk_cfg()

    api_base = cfg.get("base", "").rstrip("/")
    if not api_base or not cfg.get("token"):
        logger.info("[dingtalk] 未配置 DINGTALK_API_BASE / DINGTALK_TOKEN，跳過推送",
                    custom={"title": title})
        return {"status": "skipped", "reason": "not configured"}

    clean_recipients = [str(r).strip() for r in recipients if r]
    if not clean_recipients:
        return {"status": "skipped", "reason": "no recipients"}

    # ── 构造 markdown 消息体 ──────────────────────────────────────────────
    md_text = f"### {title}"
    if desc:
        md_text += f"\n\n{desc}"
    md_text += "\n\n---\n*來自專案管理系統*"

    url = f"{api_base}/api/sendSingleAlarm"
    data = {
        "userids":          json.dumps(clean_recipients),
        "type":             "markdown",
        "same_alarm_inter": str(cfg.get("same_alarm_inter", 5)),
        "service_name":     cfg.get("service_name", ""),
        "service_type":     cfg.get("service_type", "Web"),
        "token":            cfg.get("token", ""),
        "markdown":         json.dumps({"title": title, "text": md_text}, ensure_ascii=False),
    }

    try:
        resp = requests.post(url, data=data, timeout=10)
        resp.raise_for_status()
        result = resp.json()

        if result.get("code") == "S10000":
            content = result.get("content", {})
            logger.info(
                "[dingtalk] 推送成功",
                custom={
                    "title":      title,
                    "recipients": clean_recipients,
                    "status":     content.get("status"),
                    "query_key":  content.get("processQueryKey"),
                },
            )
            return {"status": "ok", "detail": content}
        else:
            logger.warning(
                "[dingtalk] 推送返回非成功码",
                custom={"title": title, "recipients": clean_recipients, "response": result},
            )
            return {"status": "error", "detail": result}

    except requests.exceptions.Timeout:
        logger.error("[dingtalk] 推送超時", category="error",
                     event="dingtalk_timeout",
                     custom={"title": title, "recipients": clean_recipients})
        try:
            raise self.retry(countdown=30)
        except Exception:
            return {"status": "error", "reason": "timeout"}

    except Exception as exc:
        logger.error("[dingtalk] 推送異常", category="error",
                     event="dingtalk_error",
                     custom={"title": title, "recipients": clean_recipients},
                     error=exc)
        try:
            raise self.retry(exc=exc, countdown=30)
        except Exception:
            return {"status": "error", "reason": str(exc)}
