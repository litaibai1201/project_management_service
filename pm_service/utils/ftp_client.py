# -*- coding: utf-8 -*-
"""
@文件: ftp_client.py
@说明: FTP 客户端封装 - 通用文件传输工具
@时间: 2023/03/16 14:09:23

功能说明：
    - FTP 连接管理
    - 目录操作（判断、切换、创建）
    - 文件操作（上传、下载、删除）
    - 文件大小查询与文件列表获取

使用示例：
    from utils.ftp_client import FTPClient
    
    ftp = FTPClient("192.168.1.100", 21, "user", "password")
    if ftp.ftp:
        ftp.upload_file("/remote/path/file.txt", "/local/path/file.txt")
        ftp.close_ftp()
"""
import ftplib
import traceback

from loggers import logger


class FTPClient:
    """FTP 客户端封装"""

    def __init__(self, ftp_ip, ftp_port, ftp_user, ftp_pwd):
        """
        初始化 FTP 客户端

        Args:
            ftp_ip: FTP 服务器 IP 地址
            ftp_port: FTP 服务器端口
            ftp_user: FTP 用户名
            ftp_pwd: FTP 密码
        """
        self._ftp_ip = ftp_ip
        self._ftp_port = ftp_port
        self._ftp_user = ftp_user
        self._ftp_pwd = ftp_pwd
        self.ftp = self.create_ftp()

    def create_ftp(self):
        """
        创建 FTP 连接

        Returns:
            FTP 对象或 False（连接失败）
        """
        try:
            # 创建 FTP 客户端
            ftp = ftplib.FTP()
            ftp.encoding = "utf-8"  # 改为 UTF-8 支持中文文件名
            ftp.connect(self._ftp_ip, int(self._ftp_port))
            ftp.login(self._ftp_user, self._ftp_pwd)
            logger.info(
                "FTP 连接成功",
                category="business",
                event="ftp_connected",
                custom={"host": self._ftp_ip, "port": self._ftp_port}
            )
            return ftp
        except Exception as e:
            logger.error(
                "FTP 连接失败",
                category="error",
                event="ftp_connect_failed",
                error=e,
                custom={"host": self._ftp_ip, "port": self._ftp_port}
            )
            return False

    def is_dir(self, path):
        """
        判断路径是否是目录

        Args:
            path: 远程路径

        Returns:
            bool: True 为目录，False 为非目录或错误
        """
        try:
            self.ftp.cwd(path)
            return True
        except Exception:
            return False

    def cwd_dir(self, path):
        """
        切换目录

        Args:
            path: 远程目录路径

        Returns:
            bool: 切换成功返回 True，失败返回 False
        """
        try:
            self.ftp.cwd(path)
            logger.debug(
                "FTP 切换目录",
                event="ftp_cwd",
                custom={"path": path}
            )
            return True
        except Exception as e:
            logger.warning(
                "FTP 切换目录失败",
                category="business",
                event="ftp_cwd_failed",
                custom={"path": path, "reason": str(e)}
            )
            return False

    def create_dir(self, dir_name):
        """
        创建目录

        Args:
            dir_name: 目录名称

        Returns:
            bool: 创建成功返回 True，失败返回 False
        """
        try:
            self.ftp.mkd(dir_name)
            logger.info(
                "FTP 目录创建成功",
                category="business",
                event="ftp_mkdir",
                custom={"dir_name": dir_name}
            )
            return True
        except Exception as e:
            logger.error(
                "FTP 目录创建失败",
                category="error",
                event="ftp_mkdir_failed",
                error=e,
                custom={"dir_name": dir_name}
            )
            return False

    def get_file_list(self, path):
        """
        获取目录下的文件列表

        Args:
            path: 远程目录路径

        Returns:
            list: 文件路径列表
        """
        new_file_list = []
        file_list = self.ftp.nlst(path)
        for file in file_list:
            if not file.startswith(path):
                file = path + "/" + file
            new_file_list.append(file)

        return new_file_list

    def download_file(self, filepath, local_path):
        """
        从 FTP 下载文件

        Args:
            filepath: FTP 远程文件路径
            local_path: 本地保存路径

        Returns:
            bool: 下载成功返回 True，失败返回 False
        """
        try:
            with open(local_path, "wb") as f:
                self.ftp.retrbinary("RETR " + filepath, f.write)
            logger.info(
                "FTP 文件下载成功",
                category="business",
                event="ftp_download",
                custom={"remote": filepath, "local": local_path}
            )
            return True
        except Exception as e:
            logger.error(
                "FTP 文件下载失败",
                category="error",
                event="ftp_download_failed",
                error=e,
                custom={"remote": filepath, "local": local_path}
            )
            return False

    def upload_file(self, file_path, local_path):
        """
        上传文件到 FTP

        Args:
            file_path: FTP 远程保存路径
            local_path: 本地文件路径

        Returns:
            bool: 上传成功返回 True，失败返回 False
        """
        try:
            with open(local_path, "rb") as fp:
                self.ftp.storbinary("STOR " + file_path, fp)
            logger.info(
                "FTP 文件上传成功",
                category="business",
                event="ftp_upload",
                custom={"local": local_path, "remote": file_path}
            )
            return True
        except Exception as e:
            logger.error(
                "FTP 文件上传失败",
                category="error",
                event="ftp_upload_failed",
                error=e,
                custom={"local": local_path, "remote": file_path}
            )
            return False

    def file_size(self, file_path):
        """
        获取文件大小

        Args:
            file_path: FTP 远程文件路径

        Returns:
            int: 文件大小（字节），获取失败返回 0
        """
        try:
            size = self.ftp.size(file_path)
            return size
        except Exception:
            return 0

    def delete_file(self, file_path):
        """
        删除文件

        Args:
            file_path: FTP 远程文件路径

        Returns:
            bool: 删除成功返回 True，失败返回 False
        """
        try:
            self.ftp.delete(file_path)
            logger.info(
                "FTP 文件删除成功",
                category="business",
                event="ftp_delete",
                custom={"file": file_path}
            )
            return True
        except Exception as e:
            logger.error(
                "FTP 文件删除失败",
                category="error",
                event="ftp_delete_failed",
                error=e,
                custom={"file": file_path}
            )
            return False

    def close_ftp(self):
        """
        关闭 FTP 连接

        Returns:
            bool: 关闭成功返回 True，失败返回 False
        """
        try:
            self.ftp.quit()
            self.ftp = None
            logger.info(
                "FTP 连接已关闭",
                category="business",
                event="ftp_disconnected"
            )
            return True
        except Exception as e:
            logger.error(
                "FTP 连接关闭失败",
                category="error",
                event="ftp_disconnect_failed",
                error=e
            )
            return False
