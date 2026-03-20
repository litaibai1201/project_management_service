# -*- coding: utf-8 -*-

import io
import os
import re
from datetime import datetime
from functools import lru_cache

from minio import Minio
from minio.commonconfig import ENABLED, CopySource
from minio.error import S3Error
from minio.versioningconfig import SUSPENDED, VersioningConfig

from configs.base import BaseConfig
from loggers import logger


@lru_cache(maxsize=1)
def connect_minio(host: str, port: int, access_key: str, secret_key: str, secure: bool = False):
    try:
        client = Minio(
            f"{host}:{port}",
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        logger.info("MinIO 连接成功", custom={"host": host, "port": port})
        return client
    except Exception as e:
        logger.error(
            "MinIO 连接失败",
            category="error",
            event="minio_connect_failed",
            custom={"host": host, "port": port},
            error=e,
        )
        return None


class OperMinio:
    def __init__(self) -> None:
        config = BaseConfig().MINIO_CONFIG
        self.host = config.get("host")
        self.port = config.get("port")
        self.access_key = config.get("access_key")
        self.secret_key = config.get("secret_key")
        self.secure = config.get("secure", False)
        self.client = connect_minio(
            self.host, self.port, self.access_key, self.secret_key, self.secure
        )
        self.is_connection_alive()

    def is_connection_alive(self) -> bool:
        """检测连接是否活跃，失效时清除缓存并重连"""
        try:
            self.client.list_buckets()
            return True
        except Exception as e:
            logger.warning("MinIO 连接失效，尝试重连", custom={"host": self.host}, error=e)
            connect_minio.cache_clear()
            self.client = connect_minio(
                self.host, self.port, self.access_key, self.secret_key, self.secure
            )
            return False

    def check_bucket(self, bucket_name):
        if len(re.findall('["a-z" "0-9"]', bucket_name)) != len(bucket_name):
            logger.warning("存储桶名称包含非法字符", custom={"bucket_name": bucket_name})
            return False
        if len(bucket_name) < 3:
            logger.warning("存储桶名称长度不能小于3", custom={"bucket_name": bucket_name})
            return False
        return True

    def create_bucket(self, bucket_name):
        try:
            if self.check_bucket(bucket_name):
                self.client.make_bucket(bucket_name)
                logger.info("MinIO 存储桶创建成功", custom={"bucket_name": bucket_name})
                return True
            return False
        except Exception as e:
            logger.error(
                "MinIO 存储桶创建失败",
                category="error",
                event="minio_bucket_create_failed",
                custom={"bucket_name": bucket_name},
                error=e,
            )
            return False

    def delete_bucket(self, bucket_name):
        try:
            if self.check_bucket(bucket_name):
                self.client.remove_bucket(bucket_name)
                logger.info("MinIO 存储桶删除成功", custom={"bucket_name": bucket_name})
                return True
            return False
        except Exception as e:
            logger.error(
                "MinIO 存储桶删除失败",
                category="error",
                event="minio_bucket_delete_failed",
                custom={"bucket_name": bucket_name},
                error=e,
            )
            return False

    def search_bucket(self, bucket_name):
        if self.check_bucket(bucket_name):
            found = self.client.bucket_exists(bucket_name)
            if found:
                return True
        return False

    def search_all_bucket(self):
        return [obj.name for obj in self.client.list_buckets()]

    def update_bucket(self):
        pass

    def upload_folder(self, bucket_name, object_name, folder_path):
        if not os.path.isdir(folder_path):
            return False
        folder_path = folder_path.replace("\\", "/")
        object_name = object_name.replace("\\", "/")
        if folder_path.startswith("./"):
            folder_path = folder_path[2:]
        if folder_path.endswith("/"):
            folder_path = folder_path[:-1]
        save_file = folder_path.split("/")[-1]
        try:
            for file in os.listdir(folder_path):
                if os.path.isdir(folder_path + "/" + file):
                    self.upload_folder(
                        bucket_name,
                        object_name + "/" + save_file,
                        folder_path + "/" + file,
                    )
                else:
                    self.client.fput_object(
                        bucket_name,
                        object_name + "/" + save_file + "/" + file,
                        folder_path + "/" + file,
                    )
            logger.info("MinIO 文件夹上传成功", custom={"bucket_name": bucket_name, "folder_path": folder_path})
            return True
        except Exception as e:
            logger.error(
                "MinIO 文件夹上传失败",
                category="error",
                event="minio_folder_upload_failed",
                custom={"bucket_name": bucket_name, "folder_path": folder_path},
                error=e,
            )
            return False

    def download_folder(self, bucket_name, folder_name, download_path):
        folder_name = folder_name.replace("\\", "/")
        download_path = download_path.replace("\\", "/")
        try:
            file_path = self.search_files(bucket_name, folder_name)
            for file_name in file_path:
                if str(file_name).endswith("/"):
                    if not self.download_folder(
                        bucket_name, file_name[:-1], download_path
                    ):
                        return False
                else:
                    self.client.fget_object(
                        bucket_name, file_name, download_path + "/" + file_name
                    )
            logger.info("MinIO 文件夹下载成功", custom={"bucket_name": bucket_name, "folder_name": folder_name})
            return True
        except PermissionError as e:
            logger.error(
                "MinIO 文件夹下载权限不足",
                category="error",
                event="minio_folder_download_permission_denied",
                custom={"bucket_name": bucket_name, "folder_name": folder_name, "download_path": download_path},
                error=e,
            )
            return False
        except Exception as e:
            logger.error(
                "MinIO 文件夹下载失败",
                category="error",
                event="minio_folder_download_failed",
                custom={"bucket_name": bucket_name, "folder_name": folder_name},
                error=e,
            )
            return False

    def delete_folder(self, bucket_name, folder_path):
        file_path = self.search_files(bucket_name, folder_path)
        for file_name in file_path:
            if str(file_name).endswith("/"):
                self.delete_folder(bucket_name, file_name[:-1])
            else:
                self.client.remove_object(bucket_name, file_name)
        return True

    def use_folder_get_stream(self, bucket_name, folder_path):
        folder_path = folder_path.replace("\\", "/")
        response = None
        try:
            file_list = self.client.list_objects(bucket_name, folder_path)
            all_file_stream = {}
            for file in file_list:
                if not file.object_name.endswith("/"):
                    response = self.client.get_object(bucket_name, file.object_name)
                    file_stream = [res for res in response]
                    all_file_stream[file.object_name.split("/")[-1]] = file_stream
            return all_file_stream
        except Exception as e:
            logger.error(
                "MinIO 获取文件夹流失败",
                category="error",
                event="minio_folder_stream_failed",
                custom={"bucket_name": bucket_name, "folder_path": folder_path},
                error=e,
            )
            return False
        finally:
            if response:
                response.close()
                response.release_conn()

    def get_filename_url(self, bucket_name, folder_path, version_id=None):
        folder_path = folder_path.replace("\\", "/")
        try:
            self.client.get_object(bucket_name, folder_path)
        except S3Error as e:
            logger.warning(
                "MinIO 文件不存在",
                custom={"bucket_name": bucket_name, "folder_path": folder_path},
                error=e,
            )
            return False
        file_url = self.client.presigned_get_object(
            bucket_name, folder_path, version_id=version_id
        )
        return file_url

    def search_file(self, bucket_name, file_path):
        target_file = file_path.split("/")[-1]
        save_path = file_path[: file_path.find(target_file) - 1]
        file_list = self.search_files(bucket_name, save_path)
        if target_file in file_list:
            return True
        else:
            return False

    def search_files(self, bucket_name, folder_name=""):
        if folder_name:
            folder_name = folder_name.replace("\\", "/")
            if not folder_name.endswith("/"):
                folder_name += "/"
        file_list = self.client.list_objects(bucket_name, prefix=folder_name)
        file_path = []
        for file in file_list:
            file_path.append(file.object_name)
        return file_path

    def update_folder(self):
        pass

    def upload_file(self, bucket_name, file_path, upload_path):
        if not os.path.exists(upload_path):
            return False
        if not os.path.isfile(upload_path):
            return False
        file_path = file_path.replace("\\", "/")
        upload_path = upload_path.replace("\\", "/")
        try:
            self.client.fput_object(bucket_name, file_path, upload_path)
            logger.info("MinIO 文件上传成功", custom={"bucket_name": bucket_name, "file_path": file_path})
            return True
        except Exception as e:
            logger.error(
                "MinIO 文件上传失败",
                category="error",
                event="minio_file_upload_failed",
                custom={"bucket_name": bucket_name, "file_path": file_path},
                error=e,
            )
            return False

    def upload_stream_file(self, bucket_name, file_path, stream_data):
        file_path = file_path.replace("\\", "/")
        try:
            stream_data_io = io.BytesIO(stream_data)
            self.client.put_object(
                bucket_name, file_path, stream_data_io, length=len(stream_data)
            )
            logger.info("MinIO 流文件上传成功", custom={"bucket_name": bucket_name, "file_path": file_path})
            return True
        except Exception as e:
            logger.error(
                "MinIO 流文件上传失败",
                category="error",
                event="minio_stream_upload_failed",
                custom={"bucket_name": bucket_name, "file_path": file_path},
                error=e,
            )
            return False

    def download_file(self, bucket_name, file_path, download_path, version_id=None):
        file_path = file_path.replace("\\", "/")
        download_path = download_path.replace("\\", "/")
        try:
            self.client.fget_object(
                bucket_name, file_path, download_path, version_id=version_id
            )
            logger.info("MinIO 文件下载成功", custom={"bucket_name": bucket_name, "file_path": file_path})
            return True
        except PermissionError as e:
            logger.error(
                "MinIO 文件下载权限不足",
                category="error",
                event="minio_file_download_permission_denied",
                custom={"bucket_name": bucket_name, "file_path": file_path, "download_path": download_path},
                error=e,
            )
            return False
        except Exception as e:
            logger.error(
                "MinIO 文件下载失败",
                category="error",
                event="minio_file_download_failed",
                custom={"bucket_name": bucket_name, "file_path": file_path},
                error=e,
            )
            return False

    def use_filename_get_stream(self, bucket_name, file_path):
        file_path = file_path.replace("\\", "/")
        response = None
        try:
            response = self.client.get_object(bucket_name, file_path)
            file_stream = [res for res in response]
            return file_stream
        except Exception as e:
            logger.error(
                "MinIO 获取文件流失败",
                category="error",
                event="minio_file_stream_failed",
                custom={"bucket_name": bucket_name, "file_path": file_path},
                error=e,
            )
            return False
        finally:
            if response:
                response.close()
                response.release_conn()

    def delete_file(self, bucket_name, file_path, version_id=None):
        file_path = file_path.replace("\\", "/")
        try:
            self.client.get_object(bucket_name, file_path)
            self.client.remove_object(bucket_name, file_path, version_id=version_id)
            logger.info("MinIO 文件删除成功", custom={"bucket_name": bucket_name, "file_path": file_path})
            return True
        except S3Error as e:
            logger.warning(
                "MinIO 文件不存在，无法删除",
                custom={"bucket_name": bucket_name, "file_path": file_path},
                error=e,
            )
            return False

    def update_file(self):
        pass

    def get_size(self):
        pass

    def copy_file(self, bucket_name, target_path, source_path):
        try:
            self.client.copy_object(
                bucket_name,
                target_path,
                CopySource(bucket_name, source_path),
            )
            logger.info(
                "MinIO 文件复制成功",
                custom={"bucket_name": bucket_name, "source_path": source_path, "target_path": target_path},
            )
            return True
        except S3Error as e:
            logger.error(
                "MinIO 文件复制失败，源或目标不存在",
                category="error",
                event="minio_file_copy_failed",
                custom={"bucket_name": bucket_name, "source_path": source_path, "target_path": target_path},
                error=e,
            )
            return False

    def bucket_version_status(self, bucket_name):
        return self.client.get_bucket_versioning(bucket_name).status

    def turn_on_version_control(self, bucket_name):
        self.client.set_bucket_versioning(bucket_name, VersioningConfig(ENABLED))
        if self.bucket_version_status(bucket_name) == "Enabled":
            return True
        return False

    def turn_off_version_control(self, bucket_name):
        self.client.set_bucket_versioning(
            bucket_name, VersioningConfig(status=SUSPENDED)
        )
        if self.bucket_version_status(bucket_name) == "Suspended":
            return True
        return False

    def get_file_current_version(self, bucket_name, file_name):
        return self.client.get_object(bucket_name, file_name).headers.get(
            "x-amz-version-id"
        )

    def get_file_version_list(self, bucket_name, file_name):
        version_dict = dict()
        for idx, objects_info in enumerate(
            self.client.list_objects(
                bucket_name, prefix=file_name, include_version=True
            )
        ):
            version_dict[idx] = {
                "version": objects_info.version_id,
                "update": datetime.strftime(
                    objects_info.last_modified, "%Y-%m-%d %H:%M:%S"
                ),
            }
        return version_dict
