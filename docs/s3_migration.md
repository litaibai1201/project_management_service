# 文件存储迁移至 S3 说明

> 内网 S3 支持拼接路径直接访问（无需预签名 URL），前端无需改动。

---

## 一、当前现状

所有附件保存在**本地磁盘** `uploads/` 目录，路径由环境变量 `UPLOAD_DIR` 控制。
涉及文件操作的代码分布在：

| 文件 | 负责的附件类型 |
|---|---|
| `controllers/project_controller.py` | 专案附件、进度记录附件、富文本内联图片 |
| `controllers/duty_controller.py` | AR任务进度附件 |
| `controllers/requirement_controller.py` | 需求文档 |
| `controllers/standalone_req_controller.py` | 独立需求文档 |
| `controllers/daily_log_controller.py` | 日报附件 |
| `views/duty_api.py` | 富文本内联图片上传/预览路由 |
| `views/project_api.py` | 专案附件、进度附件、需求附件的预览/下载路由 |

---

## 二、需要新建的文件

### `pm_service/utils/storage.py`

统一存储抽象层，两种后端：`LocalStorage`（本地磁盘）和 `S3Storage`（S3 对象存储）。

```python
# -*- coding: utf-8 -*-
"""
统一文件存储抽象层
  STORAGE_BACKEND=local  → 本地磁盘（默认）
  STORAGE_BACKEND=s3     → S3 对象存储，直接拼接 URL 访问
"""
import os
from typing import Optional
from configs.base import BaseConfig


def _local_base() -> str:
    return os.path.abspath(BaseConfig.UPLOAD_DIR)


class LocalStorage:
    """本地磁盘存储"""

    def save(self, key: str, data: bytes) -> None:
        path = os.path.join(_local_base(), key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(data)

    def read(self, key: str) -> Optional[bytes]:
        path = os.path.join(_local_base(), key)
        if not os.path.exists(path):
            return None
        with open(path, 'rb') as f:
            return f.read()

    def delete(self, key: str) -> None:
        path = os.path.join(_local_base(), key)
        if os.path.exists(path):
            os.remove(path)

    def size(self, key: str) -> int:
        path = os.path.join(_local_base(), key)
        return os.path.getsize(path) if os.path.exists(path) else 0

    def exists(self, key: str) -> bool:
        return os.path.exists(os.path.join(_local_base(), key))

    def public_url(self, key: str) -> Optional[str]:
        """本地存储无公开 URL，返回 None，调用方回退到 API 代理路由"""
        return None

    def local_path(self, key: str) -> str:
        return os.path.join(_local_base(), key)


class S3Storage:
    """S3 对象存储（内网拼接路径直接访问）"""

    def __init__(self):
        from utils.s3_client import OperS3
        self._s3 = OperS3()
        self._bucket = BaseConfig.S3_BUCKET
        self._base_url = BaseConfig.S3_BASE_URL.rstrip('/')

    def save(self, key: str, data: bytes) -> None:
        self._s3.upload_stream_file(self._bucket, key, data)

    def read(self, key: str) -> Optional[bytes]:
        data = self._s3.use_filename_get_stream(self._bucket, key)
        return data if data else None

    def delete(self, key: str) -> None:
        self._s3.delete_file(self._bucket, key)

    def size(self, key: str) -> int:
        return 0  # 调用方直接用 len(data) 记录

    def exists(self, key: str) -> bool:
        return self._s3.search_file(self._bucket, key)

    def public_url(self, key: str) -> str:
        """返回直接访问的 S3 URL：{base_url}/{bucket}/{key}"""
        return f"{self._base_url}/{self._bucket}/{key}"

    def local_path(self, key: str) -> Optional[str]:
        return None  # S3 无本地路径


_backend = None

def get_storage():
    global _backend
    if _backend is None:
        if getattr(BaseConfig, 'STORAGE_BACKEND', 'local') == 's3':
            _backend = S3Storage()
        else:
            _backend = LocalStorage()
    return _backend
```

---

## 三、配置变更

### `configs/base.py` — 在 `UPLOAD_DIR` 下方新增：

```python
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local")   # "local" | "s3"
S3_BUCKET       = os.environ.get("S3_BUCKET", "pm-files")
S3_BASE_URL     = os.environ.get("S3_BASE_URL", "")            # e.g. http://192.168.1.100:9000
```

### `.env` — 在文件上传配置区块新增：

```env
# 存储后端: local（本地磁盘）或 s3
STORAGE_BACKEND=s3

# S3 配置
S3_BUCKET=pm-files
S3_BASE_URL=http://192.168.1.100:9000

# S3 认证（对应 configs/base.py 中 S3_CONFIG 所用的 key）
S3_ENDPOINT=http://192.168.1.100:9000
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_REGION=us-east-1
```

---

## 四、各控制器改法（统一模式）

所有控制器改动都遵循同一套模式，只需替换三处：**上传**、**预览/下载**、**删除**。

### 4.1 上传（所有进度附件通用）

**改前：**
```python
dest_dir = self._progress_upload_dir(project_id, progress_id)
dest = os.path.join(dest_dir, f"{fid}.{ext}" if ext else fid)
f_obj.save(dest)
saved.append({"id": fid, "name": f_obj.filename, "ext": ext, "size": os.path.getsize(dest)})
```

**改后：**
```python
from utils.storage import get_storage
storage = get_storage()
key = f"progress_files/{project_id}/{progress_id}/{fid}.{ext}"
data = f_obj.read()
storage.save(key, data)
entry = {"id": fid, "name": f_obj.filename, "ext": ext, "size": len(data)}
url = storage.public_url(key)
if url:
    entry["url"] = url          # S3 直链，本地时不写入
saved.append(entry)
```

### 4.2 预览/下载路由（所有 `send_file` 路由通用）

**改前（`views/project_api.py` 等）：**
```python
abs_path, original_name = ctrl.get_progress_file_path(project_id, progress_id, file_id)
return send_file(abs_path, mimetype=..., as_attachment=False, download_name=original_name)
```

**改后：**
```python
# 在 get_progress_file_path 里，meta 中若有 url 字段就直接返回重定向
from flask import redirect
meta, original_name = ctrl.get_progress_file_meta(project_id, progress_id, file_id)
if meta.get("url", "").startswith("http"):
    return redirect(meta["url"])
# 否则原来的 send_file 逻辑不变
abs_path = ...
return send_file(abs_path, ...)
```

### 4.3 删除

**改前：**
```python
abs_path = os.path.join(os.path.abspath(BaseConfig.UPLOAD_DIR), record.file_path)
if os.path.exists(abs_path):
    os.remove(abs_path)
```

**改后：**
```python
from utils.storage import get_storage
get_storage().delete(record.file_path)
```

---

## 五、各文件改动清单

### `controllers/project_controller.py`

| 方法 | 改动 |
|---|---|
| `_upload_dir()` | 可删除，逻辑移入 `upload_project_file` |
| `upload_project_file()` | 改用 `storage.save(key, data)`；`file_path` 字段存 key |
| `delete_project_file()` | 改用 `storage.delete(record.file_path)` |
| `get_project_file_path()` | S3 时返回 `public_url`；本地时返回 `local_path` |
| `_progress_upload_dir()` | 可删除 |
| `create_progress()` | 改用 `storage.save(key, data)`；`files_json` 加 `url` 字段 |
| `get_progress_file_path()` | 改为 `get_progress_file_meta()`；返回含 `url` 的 meta dict |

### `controllers/duty_controller.py`

| 方法 | 改动 |
|---|---|
| `_duty_progress_upload_dir()` | 可删除 |
| `create_progress()` | 同上，改用 `storage.save()`；`files_json` 加 `url` 字段 |

### `controllers/requirement_controller.py`

| 方法 | 改动 |
|---|---|
| `upload_req_file()` | `base_dir` → `storage.save(key, data)`；`url` 字段存 S3 直链或 API URL |
| `get_req_file_path()` | S3 时检查 `file_info["url"]` 是否为 http → 直接返回重定向 |

### `controllers/standalone_req_controller.py`

| 方法 | 改动 |
|---|---|
| `upload_file()` | 同 requirement_controller |
| `get_file_path()` | 同 requirement_controller |

### `controllers/daily_log_controller.py`

| 方法 | 改动 |
|---|---|
| `upload_files()` | 改用 `storage.save(key, data)`；`url` 字段存 S3 直链或 API URL |
| `get_file()` | 检查 `url` 字段是否为 http → redirect；否则 `send_file` |

### `views/duty_api.py`

| 路由/方法 | 改动 |
|---|---|
| `ProgressInlineImageUploadApi.post()` | 改用 `storage.save(key, data)`；返回 `public_url()` 或 API URL |
| `ProgressInlineImageServeApi.get()` | S3 时改为 `redirect(storage.public_url(key))`；本地不变 |
| `DutyProgressFilePreviewApi.get()` | 检查 `meta.get("url")` → redirect；否则本地 `send_file` |

### `views/project_api.py`

涉及以下三个路由，均改为：先检查是否有直链 URL → redirect；否则 `send_file`：

- `/<project_id>/files/<file_id>/preview`（专案附件）
- `/<project_id>/function/<function_id>/progress/<progress_id>/files/<file_id>/preview`（进度附件）
- `/<project_id>/requirements/<req_id>/files/<file_id>/preview`（需求附件）

---

## 六、S3 文件 Key 对应关系

| 附件类型 | S3 Key 格式 |
|---|---|
| 专案附件 | `project_files/{project_id}/{file_id}.{ext}` |
| 专案进度附件 | `progress_files/{project_id}/{progress_id}/{file_id}.{ext}` |
| AR任务进度附件 | `duty_progress_files/{duty_id}/{progress_id}/{file_id}.{ext}` |
| 需求文档 | `requirements/{req_id}/{file_id}.{ext}` |
| 独立需求文档 | `standalone_req/{req_id}/{file_id}.{ext}` |
| 日报附件 | `daily_log_files/{log_id}/{file_id}.{ext}` |
| 富文本内联图片 | `progress_inline_images/{file_id}.{ext}` |

---

## 七、向后兼容

- 已存在的**本地文件**不需要迁移，现有的 API 代理路由保留，仍可正常访问
- 新上传的文件走 S3，URL 直接存入 DB
- `files_json` 中没有 `url` 字段的旧记录 → 预览路由回退到从本地磁盘读取（如已迁移，需手动搬文件）
- 前端代码**无需改动**（文件 URL 由后端生成，S3 后直接返回拼接 URL）
