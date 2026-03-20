# -*- coding: utf-8 -*-

import io
import json
import os
import re
import traceback
from functools import lru_cache

import requests
from boto3.session import Session
from botocore.config import Config
from botocore.exceptions import ClientError
from utils.tools import CommonTools, TryExcept
from configs.base import BaseConfig
from loggers import logger


@lru_cache(maxsize=2)
def connect_client(access_key, secret_key, endpoint, region="us-east-1"):
    client = None
    try:
        se = Session(aws_access_key_id=access_key, aws_secret_access_key=secret_key)
        client = se.client(
            service_name="s3",
            region_name=region,
            endpoint_url=endpoint,
            config=Config(
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=2,
                max_pool_connections=512,
            ),
        )
    except Exception as e:
        logger.error(
            "连接S3服务器异常",
            category="error",
            event="s3_connect_client_exception",
            error=e,
            custom={"endpoint": endpoint},
        )
    return client


class OperS3:
    def __init__(self) -> None:
        config = BaseConfig().S3_CONFIG
        self.endpoint = config.get("endpoint")
        self.access_key = config.get("access_key")
        self.secret_key = config.get("secret_key")
        self.region = config.get("region", "us-east-1")
        self.placement = "SMA_POLICY01"
        self.bucketshard = 2000
        self.client = connect_client(
            self.access_key, self.secret_key, self.endpoint, self.region
        )
        self.is_connection_alive()

    def is_connection_alive(self):
        """检测连接是否活跃，失效时清除缓存并重连"""
        try:
            # 发送轻量级请求测试连接 True:连接有效 False:连接关闭
            self.client.list_buckets()
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ["RequestTimeout", "ConnectionError"]:
                connect_client.cache_clear()
                self.client = connect_client(
                    self.access_key, self.secret_key, self.endpoint, self.region
                )
                return False
            # 其他错误（如权限问题）不一定表示连接关闭
            raise e
        except Exception as e:
            logger.error(
                "S3 连接检测失败",
                category="error",
                event="s3_connection_check_failed",
                custom={"endpoint": self.endpoint},
                error=e,
            )
            return False

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
        except Exception as e:
            logger.error(
                "S3 创建存储桶失败",
                category="error",
                event="s3_bucket_create_failed",
                custom={"bucket_name": bucket_name},
                error=e,
            )
            return False

    def delete_bucket(self, bucket_name):
        try:
            if self.check_bucket(bucket_name):
                self.client.delete_bucket(Bucket=bucket_name)
                return True
            return False
        except Exception as e:
            logger.error(
                "S3 删除存储桶失败",
                category="error",
                event="s3_bucket_delete_failed",
                custom={"bucket_name": bucket_name},
                error=e,
            )
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
        except Exception as e:
            logger.error(
                "上传文件夹到 S3 失败",
                category="error",
                event="s3_upload_folder_failed",
                error=e,
                custom={"bucket": bucket_name, "folder": folder_path},
            )
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
    
    def _get_all_files(self, bucket_name, folder_name):
        dataset_file_list = self.search_files(bucket_name, folder_name)
        result = dataset_file_list
        while len(dataset_file_list) == 1000:
            dataset_file_list = self.search_files(bucket_name, folder_name, dataset_file_list[-1])
            result.extend(dataset_file_list)
        return result

    def download_folder(self, bucket_name, folder_name, download_path):
        folder_name = folder_name.replace("\\", "/")
        download_path = download_path.replace("\\", "/")
        try:
            file_path = self._get_all_files(bucket_name, folder_name)
            for file_name in file_path:
                if str(file_name).endswith("/"):
                    if not self.download_folder(bucket_name, file_name[:-1], download_path):
                        return False
                else:
                    if not self.__get_object(bucket_name, file_name, download_path + "/" + file_name):
                        return False
            return True
        except Exception as e:
            logger.error(
                "下载 S3 文件夹失败",
                category="error",
                event="s3_download_folder_failed",
                error=e,
                custom={"bucket": bucket_name, "folder": folder_name},
            )
            return False

    def delete_folder(self, bucket_name, folder_path):
        file_path = self._get_all_files(bucket_name, folder_path)
        for file_name in file_path:
            if str(file_name).endswith("/"):
                self.delete_folder(bucket_name, file_name[:-1])
            else:
                try:
                    self.client.delete_object(Bucket=bucket_name, Key=file_name)
                except Exception as e:
                    logger.error(
                        "S3 删除文件失败",
                        category="error",
                        event="s3_delete_failed",
                        error=e,
                        custom={"bucket": bucket_name, "key": file_name},
                    )
        return True

    def use_folder_get_stream(self, bucket_name, folder_path):
        folder_path = folder_path.replace("\\", "/")
        try:
            file_list = self._get_all_files(bucket_name, folder_path)
            all_file_stream = {}
            for file in file_list:
                if not file.endswith("/"):
                    try:
                        response = self.client.get_object(Bucket=bucket_name, Key=file)
                        all_file_stream[file] = response['Body'].read()
                    except Exception as e:
                        logger.error(
                            "S3 读取文件流失败",
                            category="error",
                            event="s3_get_stream_failed",
                            error=e,
                            custom={"bucket": bucket_name, "key": file},
                        )
            return all_file_stream
        except Exception as e:
            logger.error(
                "获取文件流失败",
                category="error",
                event="s3_use_folder_get_stream_failed",
                error=e,
                custom={"bucket": bucket_name, "folder": folder_path},
            )
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
            self.client.get_object(Bucket=bucket_name, Key=file_path, VersionId=version_id)
            return True
        except ClientError:
            logger.debug(f"文件不存在: {file_path}", category="business", event="s3_search_file_not_found", custom={"bucket": bucket_name, "key": file_path})
            return False
        except Exception as e:
            logger.error(
                "检查文件是否存在失败",
                category="error",
                event="s3_search_file_failed",
                error=e,
                custom={"bucket": bucket_name, "key": file_path},
            )
            return False

    def search_files(self, bucket_name, folder_name="", Marker=None):
        if folder_name:
            folder_name = folder_name.replace("\\", "/")
            if not folder_name.endswith("/"):
                folder_name += "/"
        if Marker:
            data = self.client.list_objects(
                Bucket=bucket_name,
                Prefix=folder_name,
                Marker=Marker
            )
        else:
            data = self.client.list_objects(
                Bucket=bucket_name,
                Prefix=folder_name
            )
        file_list = data.get("Contents", list())
        file_path_list = []
        for file in file_list:
            file_path_list.append(file.get("Key", ""))
        return file_path_list

    def get_file_list_info(
        self,
        bucket_name,
        path="",
        MaxKeys=1000,
        Marker=None,
        AllowUnordered="false",
        Delimiter=None
    ):
        if Marker and Delimiter:
            res = self.client.list_objects(Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=path, AllowUnordered=AllowUnordered, Marker=Marker, Delimiter=Delimiter)
        elif Marker:
            res = self.client.list_objects(Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=path, AllowUnordered=AllowUnordered, Marker=Marker)
        elif Delimiter:
            res = self.client.list_objects(Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=path, AllowUnordered=AllowUnordered, Delimiter=Delimiter)
        else:
            res = self.client.list_objects(Bucket=bucket_name, MaxKeys=MaxKeys, Prefix=path, AllowUnordered=AllowUnordered)
        contents = res.get("Contents")

        return contents

    def update_folder(self):
        pass

    def upload_file(self, bucket_name, file_path, upload_path):
        try:
            if not os.path.exists(upload_path) or not os.path.isfile(upload_path):
                logger.warning("本地上传文件不存在", category="business", event="s3_upload_local_missing", custom={"local": upload_path})
                return False
            file_path = file_path.replace("\\", "/")
            upload_path = upload_path.replace("\\", "/")
            with open(upload_path, 'rb') as fh:
                self.client.put_object(
                    Bucket=bucket_name,
                    Key=file_path,
                    Body=fh.read(),
                    Metadata={"Cache-Control": "max-age=31536000"},  # 缓存1年
                )
            logger.info("上传文件成功", category="business", event="s3_put_object_success", custom={"bucket": bucket_name, "key": file_path})
            return True
        except Exception as e:
            logger.error(
                "S3 上传文件失败",
                category="error",
                event="s3_put_object_failed",
                error=e,
                custom={"bucket": bucket_name, "key": file_path, "local": upload_path},
            )
            return False

    def upload_stream_file(self, bucket_name, file_path, stream_data):
        try:
            file_path = file_path.replace("\\", "/")
            stream_data_io = io.BytesIO(stream_data)
            self.client.upload_fileobj(stream_data_io, bucket_name, file_path)
            logger.info("S3 上传流成功", category="business", event="s3_upload_stream_success", custom={"bucket": bucket_name, "key": file_path})
            return True
        except Exception as e:
            logger.error(
                "S3 上传流失败",
                category="error",
                event="s3_upload_stream_failed",
                error=e,
                custom={"bucket": bucket_name, "key": file_path},
            )
            return False

    def download_file(self, bucket_name, file_path, download_path, version_id=""):
        try:
            file_path = file_path.replace("\\", "/")
            download_path = download_path.replace("\\", "/")
            if not self.__get_object(bucket_name, file_path, download_path, version_id):
                return False
            logger.info("S3 下载文件成功", category="business", event="s3_download_file_success", custom={"bucket": bucket_name, "key": file_path, "local": download_path})
            return True
        except Exception as e:
            logger.error(
                "S3 下载文件失败",
                category="error",
                event="s3_download_file_failed",
                error=e,
                custom={"bucket": bucket_name, "key": file_path, "local": download_path},
            )
            return False

    def use_filename_get_stream(self, bucket_name, file_path):
        try:
            file_path = file_path.replace("\\", "/")
            res = self.client.get_object(Bucket=bucket_name, Key=file_path)
            data = res['Body'].read()
            return data
        except Exception as e:
            logger.error(
                "获取文件流失败",
                category="error",
                event="s3_use_filename_get_stream_failed",
                error=e,
                custom={"bucket": bucket_name, "key": file_path},
            )
            return False

    def delete_file(self, bucket_name, file_path, version_id=""):
        try:
            file_path = file_path.replace("\\", "/")
            self.client.delete_object(Bucket=bucket_name, Key=file_path, VersionId=version_id)
            logger.info("删除 S3 文件成功", category="business", event="s3_delete_success", custom={"bucket": bucket_name, "key": file_path})
            return True
        except Exception as e:
            logger.error(
                "删除 S3 文件失败",
                category="error",
                event="s3_delete_failed",
                error=e,
                custom={"bucket": bucket_name, "key": file_path},
            )
            return False

    def update_file(self):
        pass

    def get_size(self):
        pass

    def copy_file(self, bucket_name, target_path, source_path):
        # source_path = source_bucket_name + "/" + source_file_path
        try:
            self.client.copy_object(Bucket=bucket_name, Key=target_path, CopySource=source_path)
            logger.info("复制文件成功", category="business", event="s3_copy_success", custom={"bucket": bucket_name, "target": target_path, "source": source_path})
            return True
        except Exception as e:
            logger.error(
                "S3 复制/拷贝文件失败",
                category="error",
                event="s3_copy_failed",
                error=e,
                custom={"bucket": bucket_name, "target": target_path, "source": source_path},
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
            file_list = self._get_all_files(source_bkt_nm, source_folder_path)
            for file_path in file_list:
                new_file_path = source_bkt_nm + "/" + file_path
                self.copy_file(bucket_name, target_path + "/" + file_path, new_file_path)
            return True
        except Exception as e:
            logger.error(
                "复制文件夹失败",
                category="error",
                event="s3_copy_folder_failed",
                error=e,
                custom={"bucket": bucket_name, "target": target_path, "source": source_path},
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
        idx = 0
        for objects_info in Versions:
            key = objects_info["Key"]
            if key != file_name:
                continue
            version_dict[idx] = {
                "version": objects_info["VersionId"],
                "size": objects_info["Size"],
                "update": CommonTools.time_trans(objects_info["LastModified"]),
            }
            idx += 1
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
        file_list = self._get_all_files(bucket_name, path)
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
        es_config = BaseConfig().ES_CONFIG
        es_ip = es_config.get("host")
        es_port = es_config.get("port")
        station_nm = es_config.get("station_nm", "default").lower()
        url = f"http://{es_ip}:{es_port}/mos-{station_nm}/object/_search"
        headers = {"Content-Type": "application/json"}
        params = {
            "type": "object",
            "from": limit_set[0],
            "size": limit_set[1]
        }
        res = requests.get(url, json=payload, headers=headers, params=params)
        return json.loads(res.text)
