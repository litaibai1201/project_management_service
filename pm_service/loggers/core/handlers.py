# -*- coding: utf-8 -*-
"""
@文件: handlers.py
@说明: 自定义日志处理器 - 支持回滚文件归档
@时间: 2025-09-03
"""
import os
import shutil
from typing import Optional

try:
    from concurrent_log_handler import ConcurrentTimedRotatingFileHandler
except ImportError:
    ConcurrentTimedRotatingFileHandler = None


class OrganizedFileHandler(ConcurrentTimedRotatingFileHandler):
    """
    有组织的文件日志处理器

    特性:
    1. 回滚文件自动移动到独立的归档目录
    2. 自动清理超出数量限制的归档文件
    3. 保持主日志目录整洁

    目录结构示例:
        logs/
        ├── myapp.log           # 当前日志文件
        ├── error.log           # 错误日志文件
        ├── .locks/             # 锁文件目录
        │   ├── myapp.log.lock
        │   └── error.log.lock
        └── archive/            # 归档目录
            ├── myapp.log.2024-01-01
            ├── myapp.log.2024-01-02
            └── error.log.2024-01-01
    """

    def __init__(
        self,
        filename: str,
        when: str = 'D',
        interval: int = 1,
        backupCount: int = 14,
        maxBytes: int = 0,
        encoding: Optional[str] = None,
        use_gzip: bool = False,
        lock_dir: Optional[str] = None,
        archive_dir: Optional[str] = None,
        **kwargs
    ):
        """
        初始化处理器

        Args:
            filename: 日志文件路径
            when: 回滚时间单位 ('S', 'M', 'H', 'D', 'midnight')
            interval: 回滚间隔
            backupCount: 最大回滚文件数量
            maxBytes: 单个文件最大字节数
            encoding: 文件编码
            use_gzip: 是否压缩回滚文件
            lock_dir: 锁文件目录（可选，默认与日志文件同目录）
            archive_dir: 归档目录（可选）
        """
        self.archive_dir = archive_dir
        self.lock_dir = lock_dir
        self.base_filename = os.path.basename(filename)
        self.log_dir = os.path.dirname(filename) or '.'

        # 确保目录存在
        self._ensure_directories()

        # 调用父类初始化
        super().__init__(
            filename=filename,
            when=when,
            interval=interval,
            backupCount=backupCount,
            maxBytes=maxBytes,
            encoding=encoding,
            use_gzip=use_gzip,
            lock_file_directory=lock_dir,
            **kwargs
        )

    def _ensure_directories(self):
        """确保所有必要的目录都存在"""
        # 主日志目录
        if self.log_dir and not os.path.exists(self.log_dir):
            os.makedirs(self.log_dir, exist_ok=True)

        # 归档目录
        if self.archive_dir and not os.path.exists(self.archive_dir):
            os.makedirs(self.archive_dir, exist_ok=True)

        # 锁文件目录
        if self.lock_dir and not os.path.exists(self.lock_dir):
            os.makedirs(self.lock_dir, exist_ok=True)

    def doRollover(self):
        """
        执行日志回滚，将回滚文件移动到归档目录
        """
        # 调用父类的回滚方法
        super().doRollover()

        # 如果配置了归档目录，移动回滚文件
        if self.archive_dir:
            self._move_rotated_files_to_archive()

    def _move_rotated_files_to_archive(self):
        """将回滚文件移动到归档目录"""
        if not self.archive_dir:
            return

        # 扫描日志目录中的回滚文件
        try:
            for filename in os.listdir(self.log_dir):
                # 检查是否是当前日志文件的回滚版本
                if filename.startswith(self.base_filename + ".") and filename != self.base_filename:
                    # 排除锁文件
                    if filename.endswith(".lock"):
                        continue

                    src_path = os.path.join(self.log_dir, filename)
                    dst_path = os.path.join(self.archive_dir, filename)

                    # 如果是文件（不是目录），移动到归档目录
                    if os.path.isfile(src_path):
                        try:
                            shutil.move(src_path, dst_path)
                        except Exception:
                            pass
        except Exception:
            pass

        # 清理超出数量限制的归档文件
        self._cleanup_archive()

    def _cleanup_archive(self):
        """清理超出数量限制的归档文件"""
        if not self.archive_dir or self.backupCount <= 0:
            return

        try:
            # 获取当前日志文件的所有归档文件
            archive_files = []
            for filename in os.listdir(self.archive_dir):
                if filename.startswith(self.base_filename + "."):
                    filepath = os.path.join(self.archive_dir, filename)
                    if os.path.isfile(filepath):
                        archive_files.append(filepath)

            # 按修改时间排序（最旧的在前）
            archive_files.sort(key=lambda x: os.path.getmtime(x))

            # 删除超出数量限制的文件
            while len(archive_files) > self.backupCount:
                oldest_file = archive_files.pop(0)
                try:
                    os.remove(oldest_file)
                except Exception:
                    pass
        except Exception:
            pass
