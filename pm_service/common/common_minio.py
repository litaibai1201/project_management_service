# -*- coding: utf-8 -*-

import io
import os
import re
import traceback
from datetime import datetime, timedelta

from minio import Minio
from minio.commonconfig import ENABLED, CopySource
from minio.error import S3Error
from minio.versioningconfig import SUSPENDED, VersioningConfig

from common.common_tools import TryExcept
from configs.db_config import db_config_dict


class OperMinio:
    def __init__(self) -> None:
        self.dm_minio = db_config_dict.get("minio")
        self.ip = self.dm_minio.get("host")
        self.port = self.dm_minio.get("port")
        self.username = self.dm_minio.get("username")
        self.bucket_name = self.dm_minio.get("database_name")
        self.password = self.dm_minio.get("password")
        self.client = self.connect()

    def connect(self):
        client = None
        try:
            client = Minio(
                f"{self.ip}:{self.port}",
                access_key=self.username,
                secret_key=self.password,
                secure=False,
            )
        except S3Error:
            traceback.print_exc()
        except Exception:
            traceback.print_exc()
        return client

    def check_bucket(self, bucket_name):
        if len(re.findall('["a-z" "0-9"]', bucket_name)) != len(bucket_name):
            return False
        if len(bucket_name) < 3:
            return False
        return True

    def create_bucket(self, bucket_name):
        try:
            if self.check_bucket(bucket_name):
                self.client.make_bucket(bucket_name)
                return True
            return False
        except Exception:
            return False

    def delete_bucket(self, bucket_name):
        try:
            if self.check_bucket(bucket_name):
                self.client.remove_bucket(bucket_name)
                return True
            return False
        except Exception:
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
            return True
        except Exception:
            traceback.print_exc()
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
            return True
        except PermissionError:
            traceback.print_exc()
            return False
        except Exception:
            traceback.print_exc()
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
        try:
            file_list = self.client.list_objects(bucket_name, folder_path)
            all_file_stream = {}
            for file in file_list:
                if not file.object_name.endswith("/"):
                    response = self.client.get_object(bucket_name, file.object_name)
                    file_stream = [res for res in response]
                    all_file_stream[file.object_name.split("/")[-1]] = file_stream
            return all_file_stream
        except Exception:
            traceback.print_exc()
            return False
        finally:
            response.close()
            response.release_conn()

    def get_filename_url(self, bucket_name, folder_path, version_id=None):
        folder_path = folder_path.replace("\\", "/")
        try:
            self.client.get_object(bucket_name, folder_path)
        except S3Error:
            print(f"'{folder_path}' does not exist.")
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
            folder_name += "/"
        file_list = self.client.list_objects(bucket_name, prefix=folder_name,
            recursive=True)
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
            return True
        except Exception:
            traceback.print_exc()
            return False

    def upload_stream_file(self, bucket_name, file_path, stream_data):
        file_path = file_path.replace("\\", "/")
        try:
            stream_data_io = io.BytesIO(stream_data)
            self.client.put_object(
                bucket_name, file_path, stream_data_io, length=len(stream_data)
            )
            return True
        except Exception:
            traceback.print_exc()
            return False

    def download_file(self, bucket_name, file_path, download_path, version_id=None):
        file_path = file_path.replace("\\", "/")
        download_path = download_path.replace("\\", "/")
        try:
            self.client.fget_object(
                bucket_name, file_path, download_path, version_id=version_id
            )
            return True
        except PermissionError:
            traceback.print_exc()
            return False
        except Exception:
            traceback.print_exc()
            return False

    def use_filename_get_stream(self, bucket_name, file_path):
        file_path = file_path.replace("\\", "/")
        try:
            response = self.client.get_object(bucket_name, file_path)
            # file_stream = [res for res in response]
            file_stream = response.read()
            response.close()
            response.release_conn()
            return file_stream
        except Exception:
            traceback.print_exc()
            return False

    def delete_file(self, bucket_name, file_path, version_id=None):
        file_path = file_path.replace("\\", "/")
        try:
            self.client.get_object(bucket_name, file_path)
            self.client.remove_object(bucket_name, file_path, version_id=version_id)
            return True
        except S3Error:
            print(f"'{file_path}' does not exist.")
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
            return True
        except S3Error:
            print(
                f"'{bucket_name}' or '{target_path}' or '{source_path}' does not exist."
            )
            return False

    def copy_folder(self, bucket_name, target_path, source_path):
        target_path = target_path.replace("\\", "/")
        source_path = source_path.replace("\\", "/")
        if target_path.endswith("/"):
            target_path = target_path[:-1]
        if source_path.endswith("/"):
            source_path = source_path[:-1]
        try:
            file_list = self.search_files(bucket_name, source_path)
            for file_path in file_list:
                if str(file_path).endswith("/"):
                    file_dir = file_path.split("/")[-2]
                    self.copy_folder(
                        bucket_name, target_path + "/" + file_dir, file_path
                    )
                else:
                    file_name = file_path.split("/")[-1]
                    self.copy_file(
                        bucket_name, target_path + "/" + file_name, file_path
                    )
            return True
        except S3Error:
            print(
                f"'{bucket_name}' or '{target_path}' or '{source_path}' does not exist."
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
        version_dict, rsp_dict = dict(), dict()
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

    @TryExcept("minio Exception")
    def get_all_files_info_by_path(self, bucket_name, path, version_id=None):
        files_info = []
        path = path.replace("\\", "/")
        file_list = self.client.list_objects(
            bucket_name, prefix=path, recursive=True
        )
        for file in file_list:
            file_path = file.object_name
            file_url = self.client.presigned_get_object(
                bucket_name, file_path, version_id=version_id
            )
            file_name = file_path.split("/")[-1]
            file_ext = os.path.splitext(file_name)[1]
            dirs = file_path.split("/")
            last_folder = dirs[-2] if len(dirs) > 1 else None
            file_info = {
                "file_url": file_url,
                "file_name": file_name,
                "file_ext": file_ext,
                "last_folder": last_folder,
                "size": file.size,
                "created_at": datetime.strftime(
                    file.last_modified + timedelta(hours=8),
                    "%Y-%m-%d %H:%M:%S"
                )
            }
            files_info.append(file_info)
        return files_info

    @TryExcept("minio Exception")
    def calculate_files_count(self, bucket_name, path):
        path = path.replace("\\", "/")
        file_list = self.client.list_objects(
            bucket_name,
            prefix=path,
            recursive=True
        )
        files_count = sum(1 for _ in file_list)
        return files_count
