# -*- coding: utf-8 -*-
"""
@文件: dingtalk_tasks.py
@说明: 钉钉个人消息推送 Celery 异步任务
       调用第三方 POST /api/sendSingleAlarm 接口
       所有推送结果均记录日志，失败不影响主业务
"""

import json
import os
import requests

from queues.celery_queue import celery_app
from loggers import logger


def _get_dingtalk_cfg():
    """
    读取钉钉配置：优先 Flask app.config，回退到环境变量（供 Celery worker 使用）。
    """
    try:
        from flask import current_app
        # current_app._get_current_object() will raise RuntimeError outside Flask context
        app_obj = current_app._get_current_object()
        cfg = app_obj.config
        return {
            "base":             cfg.get("DINGTALK_API_BASE", ""),
            "service_name":     cfg.get("DINGTALK_SERVICE_NAME", ""),
            "service_type":     cfg.get("DINGTALK_SERVICE_TYPE", "Web"),
            "token":            cfg.get("DINGTALK_TOKEN", ""),
            "same_alarm_inter": int(cfg.get("DINGTALK_SAME_ALARM_INTER", 5)),
        }
    except Exception:
        return {
            "base":             os.environ.get("DINGTALK_API_BASE", ""),
            "service_name":     os.environ.get("DINGTALK_SERVICE_NAME", ""),
            "service_type":     os.environ.get("DINGTALK_SERVICE_TYPE", "Web"),
            "token":            os.environ.get("DINGTALK_TOKEN", ""),
            "same_alarm_inter": int(os.environ.get("DINGTALK_SAME_ALARM_INTER", 5)),
        }


def call_dingtalk_api(recipients: list, title: str, desc: str = "",
                      api_base: str = "", token: str = "",
                      service_name: str = "", service_type: str = "Web",
                      same_alarm_inter: int = 5) -> dict:
    """
    直接调用鼎+接口推送消息（同步，可在线程中调用，无需 Celery）。
    """
    api_base = api_base.rstrip("/")
    if not api_base or not token:
        logger.info("[dingtalk] 未配置 DINGTALK_API_BASE / DINGTALK_TOKEN，跳過推送",
                    custom={"title": title})
        return {"status": "skipped", "reason": "not configured"}

    clean_recipients = [str(r).strip() for r in recipients if r]
    if not clean_recipients:
        return {"status": "skipped", "reason": "no recipients"}

    md_text = f"### {title}"
    if desc:
        md_text += f"\n\n{desc}"
    md_text += "\n\n---\n*來自專案管理系統*"

    url = f"{api_base}/api/sendSingleAlarm"
    data = {
        "userids":          clean_recipients,
        "type":             "markdown",
        "same_alarm_inter": str(same_alarm_inter),
        "service_name":     service_name,
        "service_type":     service_type,
        "token":            token,
        "markdown":         json.dumps({"title": title, "text": md_text}, ensure_ascii=False),
    }

    try:
        resp = requests.post(url, data=data, timeout=10)
        resp.raise_for_status()
        result = resp.json()
        if result.get("code") == "S10000":
            content = result.get("content", {})
            logger.info("[dingtalk] 推送成功",
                        custom={"title": title, "recipients": clean_recipients,
                                "status": content.get("status")})
            return {"status": "ok", "detail": content}
        else:
            logger.warning("[dingtalk] 推送返回非成功码",
                           custom={"title": title, "recipients": clean_recipients, "response": result})
            return {"status": "error", "detail": result}
    except requests.exceptions.Timeout:
        logger.error("[dingtalk] 推送超時", category="error", event="dingtalk_timeout",
                     custom={"title": title, "recipients": clean_recipients})
        return {"status": "error", "reason": "timeout"}
    except Exception as exc:
        logger.error("[dingtalk] 推送異常", category="error", event="dingtalk_error",
                     custom={"title": title, "recipients": clean_recipients}, error=exc)
        return {"status": "error", "reason": str(exc)}


@celery_app.app.task(
    name="tasks.dingtalk.send_notification",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def send_dingtalk_notification(self, recipients: list, title: str, desc: str = "") -> dict:
    """
    Celery 异步推送鼎+消息（Celery 启动时使用）。
    内部委托 call_dingtalk_api，配置从环境变量读取（Celery worker 无 Flask 上下文）。
    """
    cfg = _get_dingtalk_cfg()
    try:
        return call_dingtalk_api(
            recipients=recipients, title=title, desc=desc,
            api_base=cfg.get("base", ""), token=cfg.get("token", ""),
            service_name=cfg.get("service_name", ""),
            service_type=cfg.get("service_type", "Web"),
            same_alarm_inter=cfg.get("same_alarm_inter", 5),
        )
    except Exception as exc:
        try:
            raise self.retry(exc=exc, countdown=30)
        except Exception:
            return {"status": "error", "reason": str(exc)}
