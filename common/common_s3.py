# -*- coding: utf-8 -*-

import io
import json
import os
import re
import traceback
from datetime import datetime

import requests
from boto3.session import Session
from configs.db_config import db_config_dict, es_config_dict

from common.common_tools import TryExcept


class OperS3:
    def __init__(self) -> None:
        self.dm_minio = db_config_dict.get("s3")
        self.ip = self.dm_minio.get("host")
        self.port = self.dm_minio.get("port")
        self.username = self.dm_minio.get("username")
        self.bucket_name = self.dm_minio.get("database_name")
        self.endpoint = self.dm_minio.get("endpoint")
        self.password = self.dm_minio.get("password")
        self.placement = "SMA_POLICY01"
        self.bucketshard = 2000
        self.client = self.connect()

    def connect(self):
        client = None
        try:
            se = Session(
                aws_access_key_id=self.username,
                aws_secret_access_key=self.password
            )
            client = se.client(
                service_name="s3",
                region_name="us-east-1",
                endpoint_url=self.endpoint
            )
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
                self.client.create_bucket(
                    Bucket=bucket_name,
                    CreateBucketConfiguration={
                        'LocationConstraint': ':{placement}'.format(placement=self.placement),
                        "BucketShard": self.bucketshard
                    }
                )
                return True
            return False
        except Exception:
            return False

    def delete_bucket(self, bucket_name):
        try:
            if self.check_bucket(bucket_name):
                self.client.delete_bucket(Bucket=bucket_name)
                return True
            return False
        except Exception:
            return False

    def search_bucket(self, bucket_name):
        if self.check_bucket(bucket_name):
            data = self.client.list_buckets()
            buckets = data.get("Buckets", list())
            for bu in buckets:
                if bu.get("Name", "") == bucket_name:
                    return True
        return False

    def search_all_bucket(self):
        data = self.client.list_buckets()
        buckets = data.get("Buckets", list())
        return [obj["Name"] for obj in buckets]

    def update_bucket(self):
        pass

    def upload_folder(self, bucket_name, object_name, folder_path):
        if not os.path.isdir(folder_path):
            return False
        folder_path = folder_path.replace("\\", "/")
        object_name = object_name.replace("\\", "/")
        folder_name = folder_path.split("/")[-1]
        if object_name != folder_name:
            if object_name == "" or len(object_name) == 0:
                object_name = folder_name
            else:
                object_name = object_name + "/" + folder_name
        try:
            for file in os.listdir(folder_path):
                file_path = folder_path + "/" + file
                if os.path.isdir(file_path):
                    self.upload_folder(bucket_name, object_name, file_path)
                else:
                    self.client.put_object(
                        Bucket=bucket_name,
                        Key=object_name + "/" + file,
                        Body=open(file_path, 'rb').read()
                    )
            return True
        except Exception:
            traceback.print_exc()
            return False

    def __get_object(self, Bucket, Key, TargetFile, VersionId=""):
        object = self.client.get_object(
            Bucket=Bucket, Key=Key, VersionId=VersionId
        )
        dir_list = TargetFile.split("/")
        if len(dir_list) > 1:
            _dirs = "/".join(dir_list[: -1])
            if not os.path.exists(_dirs):
                os.makedirs(_dirs)
        with open(TargetFile, "wb") as f:
            f.write(object['Body'].read())
        return True

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
                    self.__get_object(
                        bucket_name, file_name, download_path + "/" + file_name
                    )
            return True
        except Exception:
            traceback.print_exc()
            return False

    def delete_folder(self, bucket_name, folder_path):
        file_path = self.search_files(bucket_name, folder_path)
        for file_name in file_path:
            if str(file_name).endswith("/"):
                self.delete_folder(bucket_name, file_name[:-1])
            else:
                self.client.delete_object(Bucket=bucket_name, Key=file_name)
        return True

    def use_folder_get_stream(self, bucket_name, folder_path):
        folder_path = folder_path.replace("\\", "/")
        try:
            file_list = self.search_files(bucket_name, folder_path)
            all_file_stream = {}
            for file in file_list:
                if not file.endswith("/"):
                    response = self.client.get_object(
                        Bucket=bucket_name, Key=file
                    )
                    all_file_stream[file] = response['Body'].read()
            return all_file_stream
        except Exception:
            traceback.print_exc()
            return False

    def __get_url(self, Params, ExpiresIn=3600):
        return self.client.generate_presigned_url(
            ClientMethod='get_object',
            Params=Params,
            ExpiresIn=ExpiresIn,
            HttpMethod='GET',
        )

    def get_filename_url(
        self, bucket_name, folder_path, version_id="", ExpiresIn=3600
    ):
        folder_path = folder_path.replace("\\", "/")
        result = self.search_file(bucket_name, folder_path, version_id)
        if not result:
            return False
        Params = {'Bucket': bucket_name, 'Key': folder_path}
        if version_id:
            Params["VersionId"] = version_id
        return self.__get_url(Params, ExpiresIn)

    def search_file(self, bucket_name, file_path, version_id=""):
        try:
            self.client.get_object(
                Bucket=bucket_name, Key=file_path, VersionId=version_id
            )
            return True
        except Exception:
            print(f"'{file_path}' does not exist.")
            return False

    def search_files(self, bucket_name, folder_name=""):
        if folder_name:
            folder_name = folder_name.replace("\\", "/")
            if not folder_name.endswith("/"):
                folder_name += "/"
        data = self.client.list_objects(
            Bucket=bucket_name,
            Prefix=folder_name
        )
        file_list = data.get("Contents", list())
        file_path_list = []
        for file in file_list:
            file_path_list.append(file.get("Key", ""))
        return file_path_list

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
            self.client.set
            self.client.put_object(
                Bucket=bucket_name,
                Key=file_path,
                Body=open(upload_path, 'rb').read()
            )
            return True
        except Exception:
            traceback.print_exc()
            return False

    def upload_stream_file(self, bucket_name, file_path, stream_data):
        file_path = file_path.replace("\\", "/")
        try:
            stream_data_io = io.BytesIO(stream_data)
            self.client.upload_fileobj(stream_data_io, bucket_name, file_path)
            return True
        except Exception:
            traceback.print_exc()
            return False

    def download_file(
        self,
        bucket_name,
        file_path,
        download_path,
        version_id=""
    ):
        file_path = file_path.replace("\\", "/")
        download_path = download_path.replace("\\", "/")
        try:
            self.__get_object(
                bucket_name, file_path, download_path, version_id
            )
            return True
        except Exception:
            traceback.print_exc()
            return False

    def use_filename_get_stream(self, bucket_name, file_path):
        file_path = file_path.replace("\\", "/")
        try:
            res = self.client.get_object(Bucket=bucket_name, Key=file_path)
            return res['Body'].read()
        except Exception:
            traceback.print_exc()
            return False

    def delete_file(self, bucket_name, file_path, version_id=""):
        file_path = file_path.replace("\\", "/")
        try:
            self.client.delete_object(
                Bucket=bucket_name,
                Key=file_path,
                VersionId=version_id
            )
            return True
        except Exception:
            print(f"'{file_path}' does not exist.")
            return False

    def update_file(self):
        pass

    def get_size(self):
        pass

    def copy_file(self, bucket_name, target_path, source_path):
        # source_path = source_bucket_name + "/" + source_file_path
        try:
            self.client.copy_object(
                Bucket=bucket_name,
                Key=target_path,
                CopySource=source_path
            )
            return True
        except Exception:
            print(
                f"'{bucket_name}' or '{target_path}' or '{source_path}' does not exist."
            )
            return False

    def copy_folder(self, bucket_name, target_path, source_path):
        # source_path = source_bucket_name + "/" + source_file_path
        target_path = target_path.replace("\\", "/")
        source_path = source_path.replace("\\", "/")
        if target_path.endswith("/"):
            target_path = target_path[:-1]
        if source_path.endswith("/"):
            source_path = source_path[:-1]
        source_list = source_path.split("/")
        source_bkt_nm = source_list[0]
        source_folder_path = "/".join(source_list[1:])
        try:
            file_list = self.search_files(source_bkt_nm, source_folder_path)
            for file_path in file_list:
                new_file_path = source_bkt_nm + "/" + file_path
                self.copy_file(
                    bucket_name,
                    target_path + "/" + file_path,
                    new_file_path
                )
            return True
        except Exception:
            print(
                f"'{bucket_name}' or '{target_path}' or '{source_path}' does not exist."
            )
            return False

    def bucket_version_status(self, bucket_name):
        res = self.client.get_bucket_versioning(Bucket=bucket_name)
        status = res.get("Status", "Suspended")
        if status == "Enabled":
            return True
        return False

    def turn_on_version_control(self, bucket_name, MaxVersioningNum=32):
        data = {"Status": "Enabled", "MaxVersioningNum": MaxVersioningNum}
        self.client.put_bucket_versioning(
            Bucket=bucket_name,
            VersioningConfiguration=data
        )
        if self.bucket_version_status(bucket_name):
            return True
        return False

    def turn_off_version_control(self, bucket_name):
        data = {"Status": "Suspended"}
        self.client.put_bucket_versioning(
            Bucket=bucket_name,
            VersioningConfiguration=data
        )
        if not self.bucket_version_status(bucket_name):
            return True
        return False

    def get_file_current_version(self, bucket_name, file_name):
        res = self.client.get_object(Bucket=bucket_name, Key=file_name)
        headers = res.get("ResponseMetadata", dict()).get("HTTPHeaders", dict())
        return headers.get("x-amz-version-id", "")

    def get_file_version_list(
        self,
        bucket_name,
        file_name,
        MaxKeys=1000,
        AllowUnordered='true',
        Marker=None,
        Delimiter=None
    ):
        if Marker and Delimiter:
            res = self.client.list_object_versions(
                Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=file_name,
                AllowUnordered=AllowUnordered, Marker=Marker,
                Delimiter=Delimiter
            )
        elif Marker:
            res = self.client.list_object_versions(
                Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=file_name,
                AllowUnordered=AllowUnordered, Marker=Marker
            )
        elif Delimiter:
            res = self.client.list_object_versions(
                Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=file_name,
                AllowUnordered=AllowUnordered, Delimiter=Delimiter
            )
        else:
            res = self.client.list_object_versions(
                Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=file_name,
                AllowUnordered=AllowUnordered
            )
        version_dict = dict()
        Versions = res.get("Versions")
        for idx, objects_info in enumerate(Versions):
            version_dict[idx] = {
                "version": objects_info["VersionId"],
                "update": datetime.strftime(
                    objects_info["LastModified"], "%Y-%m-%d %H:%M:%S"
                ),
            }
        return version_dict

    @TryExcept("minio Exception")
    def get_all_files_info_by_path(self, bucket_name, path):
        files_info = []
        path = path.replace("\\", "/")
        res = self.client.list_objects(Bucket=bucket_name, Prefix=path)
        file_list = res.get("Contents", list())
        for file in file_list:
            file_path = file.get("Key")
            Params = {'Bucket': bucket_name, 'Key': file_path}
            file_url = self.__get_url(Params)
            file_name = file_path.split("/")[-1]
            file_ext = os.path.splitext(file_name)[1]
            dirs = file_path.split("/")
            last_folder = dirs[-2] if len(dirs) > 1 else None
            file_info = {
                "file_url": file_url,
                "file_name": file_name,
                "file_ext": file_ext,
                "last_folder": last_folder,
            }
            files_info.append(file_info)
        return files_info

    @TryExcept("minio Exception")
    def calculate_files_count(self, bucket_name, path):
        path = path.replace("\\", "/")
        file_list = self.search_files(bucket_name, path)
        files_count = sum(1 for _ in file_list)
        return files_count

    @TryExcept("數據獲取失敗")
    def search_from_es(self, payload, limit_set: set = (0, 10000)):
        """
        payload = {
            "query": {"bool": {"filter": [], must: []}},
            "sort": {}
        }
        filter 內傳入需要篩選的條件, 有以下條件:
        存儲端保存時間: {"range": {"meta.mtime": {"gte": "開始時間", "lte":"結束時間"}}}
        數據創建時間：{"range": {"origin_mtime": {"gte": "開始時間", "lte":"結束時間"}}}
            時間格式為: 2024-11-07T01:05:27.243Z
        桶名：{"terms": {"bucket": ["bucket name"]}}
        存儲類別: {"terms": {"meta.storage_class": ["standard"]}}
            標準存儲: standard
            低頻訪問存儲: standard_ia
            歸檔存儲(磁帶): tape
            歸檔存儲(藍光): blue_ray
            歸檔存儲(華為云標準): obs_standard
            歸檔存儲(華為云低頻): obs_warm
            歸檔存儲(華為云歸檔): obs_cold
            歸檔存儲(阿里云標準): oss_standard
            歸檔存儲(阿里云低頻): oss_ia
            歸檔存儲(阿里云歸檔): oss_archive
            歸檔存儲(NAS): nas_archive
            納管(NAS): nas
            納管(S3): import
        文件大小: {"range": {"meta.size": {"lte": 最大值, "gte": 最小值}}}
            文件大小值單位: KB
        must 內傳入需要篩選的條件
        用戶ID: 默認與用戶名相同, 如: {"term": {"owner.id": "sma"}}
        match: 關鍵字匹配, 如: {"match": {"tagging": {"query": "city=shenzhen","operator": "and","analyzer": "ik_mos"}}}
        sort 內傳入排序條件
        存儲端保存時間排序: {"meta.mtime": {"order": "desc"}}
            desc: 降序
            asc: 升序
        """
        es_ip = es_config_dict["ip"]
        es_port = es_config_dict["port"]
        station_nm = es_config_dict["station_nm"].lower()
        url = f"http://{es_ip}:{es_port}/mos-{station_nm}/object/_search"
        headers = {"Content-Type": "application/json"}
        params = {
            "type": "object",
            "from": limit_set[0],
            "size": limit_set[1]
        }
        res = requests.get(url, json=payload, headers=headers, params=params)
        return json.loads(res.text)
