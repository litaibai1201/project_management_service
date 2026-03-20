# -*- coding: utf-8 -*-
"""
@文件: file_controller.py
@说明: 文件控制器 - 处理文件上传/下载相关业务逻辑
@时间: 2026/02/09

MVC 模式说明：
    Controller 层：负责业务逻辑处理
    - 封装 MinIO/S3 文件操作
    - 文件类型校验
    - 提供统一的文件操作接口
"""

from typing import Optional, Set

from utils.exceptions import ValidationException
from configs.base import BaseConfig
from utils.minio_client import OperMinio


class FileController:
    """文件控制器"""

    def __init__(self):
        try:
            self.minio = OperMinio()
            self.available = True
        except Exception:
            self.minio = None
            self.available = False

        self.allowed_extensions = BaseConfig.UPLOAD_ALLOWED_EXTENSIONS

    def _check_service(self):
        """检查 MinIO 服务是否可用"""
        if not self.available:
            raise ValidationException(msg="MinIO 服务未配置")

    def _validate_extension(self, filename: str) -> str:
        """
        校验文件扩展名

        Args:
            filename: 文件名

        Returns:
            扩展名

        Raises:
            ValidationException: 不支持的文件类型
        """
        file_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if file_ext not in self.allowed_extensions:
            raise ValidationException(
                msg=f"不支持的文件类型: {file_ext}",
                content={"allowed": list(self.allowed_extensions)}
            )
        return file_ext

    def get_file_url(self, bucket_name: str, file_path: str) -> dict:
        """
        获取文件下载链接

        Args:
            bucket_name: 存储桶名称
            file_path: 文件路径

        Returns:
            包含文件 URL 的字典

        Raises:
            ValidationException: 服务不可用或文件不存在
        """
        self._check_service()

        file_url = self.minio.get_filename_url(bucket_name, file_path)
        if not file_url:
            raise ValidationException(msg="文件不存在")

        return {"file_url": file_url}

    def upload_file(
        self,
        bucket_name: str,
        file_path: str,
        file_data: bytes,
        filename: str
    ) -> dict:
        """
        上传文件

        Args:
            bucket_name: 存储桶名称
            file_path: 存储路径
            file_data: 文件二进制数据
            filename: 原始文件名（用于校验扩展名）

        Returns:
            上传结果

        Raises:
            ValidationException: 服务不可用、文件类型不支持或上传失败
        """
        self._check_service()

        # 校验文件类型
        self._validate_extension(filename)

        # 上传文件
        result = self.minio.upload_stream_file(bucket_name, file_path, file_data)

        if not result:
            raise ValidationException(msg="文件上传失败")

        return {"file_path": file_path, "bucket_name": bucket_name}

    def delete_file(self, bucket_name: str, file_path: str) -> dict:
        """
        删除文件

        Args:
            bucket_name: 存储桶名称
            file_path: 文件路径

        Returns:
            删除结果

        Raises:
            ValidationException: 服务不可用
        """
        self._check_service()

        self.minio.remove_file(bucket_name, file_path)
        return {"deleted": True, "file_path": file_path}

    def list_files(
        self,
        bucket_name: str,
        prefix: Optional[str] = None
    ) -> dict:
        """
        列出文件

        Args:
            bucket_name: 存储桶名称
            prefix: 文件前缀（可选）

        Returns:
            文件列表

        Raises:
            ValidationException: 服务不可用
        """
        self._check_service()

        files = self.minio.list_files(bucket_name, prefix)
        return {"files": files, "count": len(files) if files else 0}
