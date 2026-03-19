# -*- coding: utf-8 -*-
"""
@文件: common_cache.py
@說明: Redis 緩存工具 — 支持 TTL 的 get/set/delete
@時間: 2024/07/19 10:07:15
@作者: LiDong
"""

import hashlib
import json

from flask import current_app as app

from cache import redis_client

# ─── 緩存 TTL 常量（秒）─────────────────────────────────────────────────────
TTL_PRESIGNED_URL = 55 * 60      # 預簽名 URL 緩存 55 分鐘（MinIO 1h，提前 5min 失效）
TTL_DRAFT_REPORT = 2 * 60 * 60   # 草稿報告緩存 2 小時
TTL_USER_PROFILE = 30 * 60       # 用戶信息緩存 30 分鐘
TTL_PROJECT_DETAIL = 10 * 60     # 項目詳情緩存 10 分鐘


def _make_key(*parts) -> str:
    """將多個部分拼接為 Redis key"""
    return ":".join(str(p) for p in parts)


def _hash_minio_key(minio_key: str) -> str:
    """對長 minio_key 做 md5 短縮，作為 Redis key 片段"""
    return hashlib.md5(minio_key.encode()).hexdigest()[:16]


# ─── 預簽名 URL 緩存 ─────────────────────────────────────────────────────────

def cache_get_presigned_url(minio_key: str) -> str:
    """從 Redis 取預簽名 URL，不存在返回空字串"""
    try:
        key = _make_key("presigned", _hash_minio_key(minio_key))
        val = redis_client.get(key)
        return val.decode() if val else ""
    except Exception as e:
        app.logger.warning(f"[Cache] 讀取預簽名 URL 失敗: {e}")
        return ""


def cache_set_presigned_url(minio_key: str, url: str, ttl: int = TTL_PRESIGNED_URL):
    """將預簽名 URL 寫入 Redis，TTL 默認 55 分鐘"""
    try:
        key = _make_key("presigned", _hash_minio_key(minio_key))
        redis_client.setex(key, ttl, url)
    except Exception as e:
        app.logger.warning(f"[Cache] 寫入預簽名 URL 失敗: {e}")


def cache_delete_presigned_url(minio_key: str):
    """刪除指定 minio_key 的預簽名 URL 緩存"""
    try:
        key = _make_key("presigned", _hash_minio_key(minio_key))
        redis_client.delete(key)
    except Exception as e:
        app.logger.warning(f"[Cache] 刪除預簽名 URL 失敗: {e}")


# ─── 草稿報告緩存 ────────────────────────────────────────────────────────────

def cache_key_draft_report(work_no: str, report_type: str, period_start: str) -> str:
    return _make_key("report", "draft", work_no, report_type, period_start)


def cache_get_draft_report(work_no: str, report_type: str, period_start: str) -> dict:
    """從 Redis 取草稿報告，不存在返回 None"""
    try:
        key = cache_key_draft_report(work_no, report_type, period_start)
        val = redis_client.get(key)
        return json.loads(val.decode()) if val else None
    except Exception as e:
        app.logger.warning(f"[Cache] 讀取草稿報告失敗: {e}")
        return None


def cache_set_draft_report(
    work_no: str, report_type: str, period_start: str,
    content: dict, ttl: int = TTL_DRAFT_REPORT
):
    """將草稿報告寫入 Redis，TTL 默認 2 小時"""
    try:
        key = cache_key_draft_report(work_no, report_type, period_start)
        redis_client.setex(key, ttl, json.dumps(content, ensure_ascii=False))
    except Exception as e:
        app.logger.warning(f"[Cache] 寫入草稿報告失敗: {e}")


def cache_delete_draft_report(work_no: str, report_type: str, period_start: str):
    """確認報告後主動失效草稿緩存"""
    try:
        key = cache_key_draft_report(work_no, report_type, period_start)
        redis_client.delete(key)
    except Exception as e:
        app.logger.warning(f"[Cache] 刪除草稿報告緩存失敗: {e}")


# ─── 通用 TTL 緩存 ───────────────────────────────────────────────────────────

def cache_get(key: str) -> str:
    """通用 get（返回字串或 None）"""
    try:
        val = redis_client.get(key)
        return val.decode() if val else None
    except Exception as e:
        app.logger.warning(f"[Cache] get 失敗: {key}, {e}")
        return None


def cache_set(key: str, value: str, ttl: int = 600):
    """通用 set with TTL"""
    try:
        redis_client.setex(key, ttl, value)
    except Exception as e:
        app.logger.warning(f"[Cache] set 失敗: {key}, {e}")


def cache_delete(key: str):
    """通用 delete"""
    try:
        redis_client.delete(key)
    except Exception as e:
        app.logger.warning(f"[Cache] delete 失敗: {key}, {e}")
