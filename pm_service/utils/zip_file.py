# -*- coding: utf-8 -*-
"""
@File    :   zip_file.py
@Time    :   2025-02-12 16:37:48
@Version :   1.0
@Desc    :   ZIP文件处理工具
"""
import zipfile
from pathlib import Path

from loggers import logger


class ZipMethod:

    @staticmethod
    def extract_local_zip_file(zip_path: str, zip_save_dir_path: str):
        """解壓ZIP文件"""
        try:
            zip_pure = Path(zip_path)
            logger.info(
                "开始解压ZIP文件",
                category="business",
                event="zip_extract_start",
                custom={"file": str(zip_pure.name), "path": zip_path}
            )
            # 解压文件
            with zipfile.ZipFile(zip_pure, "r") as zip_ref:
                # 获取所有文件列表
                file_list = zip_ref.namelist()
                total_files = len(file_list)

                # 创建解压目录
                img_save_pure = Path(zip_save_dir_path) / zip_pure.stem
                img_save_pure.mkdir(parents=True, exist_ok=True)
                img_save_pure = Path(img_save_pure)

                # 解压所有文件并显示进度
                for i, file in enumerate(file_list, 1):
                    zip_ref.extract(file, img_save_pure)
                    logger.debug(
                        "解压进度",
                        event="zip_extract_progress",
                        custom={"progress": f"{i}/{total_files}", "file": file}
                    )

            logger.info(
                "解压完成",
                category="business",
                event="zip_extract_success",
                custom={"file": str(zip_pure.name), "save_path": str(img_save_pure)}
            )
            return img_save_pure

        except zipfile.BadZipFile:
            logger.error(
                "解压ZIP失败，无效的ZIP文件",
                category="error",
                event="zip_extract_bad_file",
                custom={"path": zip_path}
            )
            return False
        except Exception as e:
            logger.error(
                "解压ZIP失败",
                category="error",
                event="zip_extract_failed",
                error=e,
                custom={"path": zip_path}
            )
            return False
