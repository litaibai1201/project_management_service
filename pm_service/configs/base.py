# -*- coding: utf-8 -*-
"""
@文件: base.py
@说明: 基础配置类
@时间: 2023/10/19
"""
import os

from crypto import decrypt_env


def _get_bool(key: str, default: str = "false") -> bool:
    """从环境变量获取布尔值"""
    return os.environ.get(key, default).lower() in ("1", "true", "yes")


def _get_int(key: str, default: int = 0) -> int:
    """从环境变量获取整数"""
    return int(os.environ.get(key, str(default)))


def _get_secret(key: str, default: str = "") -> str:
    """从环境变量获取敏感配置，自动解密 ENC() 格式的值

    用于密码、密钥等敏感配置项
    """
    return decrypt_env(key, default)


class BaseConfig:
    """基础配置 - 所有环境共用"""
    # ==================== 服务器配置 ====================
    SERVER_HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
    SERVER_PORT = _get_int("SERVER_PORT", 19999)

    # ==================== Flask 基础配置 ====================
    JSON_AS_ASCII = False
    PROPAGATE_EXCEPTIONS = True
    SECRET_KEY = _get_secret("SECRET_KEY", "dev-secret-key")

    # ==================== CORS 配置 ====================
    CORS_HEADERS = "Content-Type"
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

    # ==================== API 文档配置 ====================
    API_TITLE = os.environ.get("API_TITLE", "REST API")
    API_VERSION = os.environ.get("API_VERSION", "v1")
    OPENAPI_VERSION = "3.0.3"
    OPENAPI_URL_PREFIX = "/"
    OPENAPI_SWAGGER_UI_PATH = "/swagger-ui"
    OPENAPI_SWAGGER_UI_URL = "https://cdn.jsdelivr.net/npm/swagger-ui-dist/"

    # ==================== JWT 配置 ====================
    JWT_SECRET_KEY = _get_secret("JWT_SECRET_KEY", "jwt-secret-key")
    JWT_ACCESS_TOKEN_EXPIRES = _get_int("JWT_ACCESS_TOKEN_EXPIRES", 3600)
    JWT_REFRESH_TOKEN_EXPIRES = _get_int("JWT_REFRESH_TOKEN_EXPIRES", 86400 * 7)
    JWT_TOKEN_LOCATION = ["headers", "query_string"]
    JWT_QUERY_STRING_NAME = "token"

    # ==================== 请求配置 ====================
    REQUEST_TIMEOUT = _get_int("REQUEST_TIMEOUT", 30)
    REQUEST_MAX_RETRIES = _get_int("REQUEST_MAX_RETRIES", 3)

    # ==================== 分页配置 ====================
    PAGE_SIZE_DEFAULT = _get_int("PAGE_SIZE_DEFAULT", 20)
    PAGE_SIZE_MAX = _get_int("PAGE_SIZE_MAX", 100)

    # ==================== 缓存配置 ====================
    CACHE_DEFAULT_TIMEOUT = _get_int("CACHE_DEFAULT_TIMEOUT", 300)

    # ==================== 文件上传配置 ====================
    MAX_CONTENT_LENGTH = _get_int("MAX_CONTENT_LENGTH", 50 * 1024 * 1024)
    UPLOAD_ALLOWED_EXTENSIONS = {
        "png", "jpg", "jpeg", "gif", "webp",
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "txt", "md", "yaml", "yml", "csv", "html", "htm",
    }
    UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))

    # ==================== MySQL 配置 ====================
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False

    # ==================== Redis 配置 ====================
    REDIS_REQUIRED = _get_bool("REDIS_REQUIRED", "true")
    REDIS_POOL_SIZE = _get_int("REDIS_POOL_SIZE", 10)
    REDIS_MAX_CONNECTIONS = _get_int("REDIS_MAX_CONNECTIONS", 50)
    REDIS_SOCKET_KEEPALIVE = _get_bool("REDIS_SOCKET_KEEPALIVE", "true")
    REDIS_SOCKET_CONNECT_TIMEOUT = _get_int("REDIS_SOCKET_CONNECT_TIMEOUT", 5)
    REDIS_SOCKET_TIMEOUT = _get_int("REDIS_SOCKET_TIMEOUT", 5)
    REDIS_RETRY_ON_TIMEOUT = _get_bool("REDIS_RETRY_ON_TIMEOUT", "true")
    REDIS_HEALTH_CHECK_INTERVAL = _get_int("REDIS_HEALTH_CHECK_INTERVAL", 30)

    # Redis 配置
    REDIS_RESPONSE = True

    KEEP_ALIVE = True

    @property
    def SQLALCHEMY_DATABASE_URI(self):
        return "mysql+pymysql://{}:{}@{}:{}/{}?charset=utf8".format(
            os.environ.get("MYSQL_USERNAME"),
            _get_secret("MYSQL_PASSWORD", ""),
            os.environ.get("MYSQL_HOST", "127.0.0.1"),
            os.environ.get("MYSQL_PORT", "3306"),
            os.environ.get("MYSQL_DATABASE"),
        )

    @property
    def SQLALCHEMY_ENGINE_OPTIONS(self):
        return {
            "pool_size": _get_int("SQLPOOL_POOL_SIZE", 10),
            "max_overflow": _get_int("SQLPOOL_MAX_OVERFLOW", 20),
            "pool_recycle": _get_int("SQLPOOL_POOL_RECYCLE", 3600),
            "pool_pre_ping": _get_bool("SQLPOOL_PRE_PING", "true"),
        }

    @property
    def REDIS_URL(self):
        username = os.environ.get("REDIS_USERNAME", "")
        password = _get_secret("REDIS_PASSWORD", "")
        host = os.environ.get("REDIS_HOST", "127.0.0.1")
        port = os.environ.get("REDIS_PORT", "6379")
        db = os.environ.get("REDIS_DATABASE", "0")

        if username and password:
            auth = f"{username}:{password}@"
        elif password:
            auth = f":{password}@"
        else:
            auth = ""

        return f"redis://{auth}{host}:{port}/{db}"

    # ==================== MinIO 配置 ====================
    @property
    def MINIO_CONFIG(self):
        return {
            "host": os.environ.get("MINIO_HOST", "127.0.0.1"),
            "port": _get_int("MINIO_PORT", 9000),
            "access_key": os.environ.get("MINIO_USERNAME", "minioadmin"),
            "secret_key": _get_secret("MINIO_PASSWORD", "minioadmin"),
            "secure": _get_bool("MINIO_SECURE", "false"),
        }

    # ==================== S3 配置 ====================
    @property
    def S3_CONFIG(self):
        return {
            "endpoint": os.environ.get("S3_ENDPOINT", "http://127.0.0.1:8080"),
            "access_key": os.environ.get("S3_USERNAME", ""),
            "secret_key": _get_secret("S3_PASSWORD", ""),
            "region": os.environ.get("S3_REGION", "us-east-1"),
        }

    # ==================== MongoDB 配置 ====================
    MONGO_URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017")
    MONGO_DATABASE = os.environ.get("MONGO_DATABASE", "test")
    MONGO_MAX_POOL_SIZE = _get_int("MONGO_MAX_POOL_SIZE", 100)
    MONGO_MIN_POOL_SIZE = _get_int("MONGO_MIN_POOL_SIZE", 10)
    MONGO_CONNECT_TIMEOUT = _get_int("MONGO_CONNECT_TIMEOUT", 5000)
    MONGO_SERVER_SELECTION_TIMEOUT = _get_int("MONGO_SERVER_SELECTION_TIMEOUT", 5000)
    MONGO_REQUIRED = os.environ.get("MONGO_REQUIRED", "true").lower() != "false"

    # ==================== 限流配置 ====================
    RATELIMIT_ENABLED = _get_bool("RATELIMIT_ENABLED", "true")
    RATELIMIT_DEFAULT = os.environ.get("RATELIMIT_DEFAULT", "200 per day, 50 per hour")
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")

    # ==================== FTP 配置 ====================
    FTP_ENABLED = _get_bool("FTP_ENABLED", "false")
    FTP_HOST = os.environ.get("FTP_HOST", "127.0.0.1")
    FTP_PORT = _get_int("FTP_PORT", 21)
    FTP_USERNAME = os.environ.get("FTP_USERNAME", "")
    FTP_PASSWORD = _get_secret("FTP_PASSWORD", "")
    FTP_TIMEOUT = _get_int("FTP_TIMEOUT", 30)

    # ==================== Oracle 配置 ====================
    @property
    def ORACLE_CONFIG(self):
        return {
            "host": os.environ.get("ORACLE_HOST", "127.0.0.1"),
            "port": _get_int("ORACLE_PORT", 1521),
            "username": os.environ.get("ORACLE_USERNAME", ""),
            "password": _get_secret("ORACLE_PASSWORD", ""),
            "service_name": os.environ.get("ORACLE_SERVICE_NAME", ""),
            "pool_size": _get_int("ORACLE_POOL_SIZE", 10),
            "max_overflow": _get_int("ORACLE_MAX_OVERFLOW", 20),
            "pool_recycle": _get_int("ORACLE_POOL_RECYCLE", 3600),
            "pool_pre_ping": _get_bool("ORACLE_POOL_PRE_PING", "true"),
        }

    @property
    def ORACLE_DATABASE_URI(self):
        config = self.ORACLE_CONFIG
        return "oracle+cx_oracle://{}:{}@{}:{}/{}".format(
            config["username"],
            config["password"],
            config["host"],
            config["port"],
            config["service_name"],
        )

    # ==================== SQLite 配置 ====================
    @property
    def SQLITE_CONFIG(self):
        return {
            "db_path": os.environ.get("SQLITE_DB_PATH", "./data/sqlite"),
            "db_name": os.environ.get("SQLITE_DB_NAME", "app.db"),
            "pool_size": _get_int("SQLITE_POOL_SIZE", 5),
            "max_overflow": _get_int("SQLITE_MAX_OVERFLOW", 10),
            "pool_timeout": _get_int("SQLITE_POOL_TIMEOUT", 30),
            "pool_pre_ping": _get_bool("SQLITE_POOL_PRE_PING", "true"),
            "connect_timeout": _get_int("SQLITE_CONNECT_TIMEOUT", 30),
        }

    # ==================== 分库分表配置 ====================
    # 分片策略：date, hash, range
    SHARDING_STRATEGY = os.environ.get("SHARDING_STRATEGY", "date")

    @property
    def SHARDING_CONFIG(self):
        """
        分库分表统一配置

        环境变量说明：
        - SHARDING_DB_ENABLED: 是否启用分库（默认 false）
        - SHARDING_TABLE_ENABLED: 是否启用分表（默认 false）
        - SHARDING_DB_FORMAT: 分库日期格式（默认 %Y%m%d 按天）
        - SHARDING_TABLE_FORMAT: 分表日期格式（默认 %Y%m%d 按天）

        常用格式：
        - %Y%m%d: 按天（20240115）
        - %Y%m: 按月（202401）
        - %Y: 按年（2024）
        - %Y_w%W: 按周（2024_w03）
        """
        return {
            # 开关配置
            "db_enabled": _get_bool("SHARDING_DB_ENABLED", "false"),
            "table_enabled": _get_bool("SHARDING_TABLE_ENABLED", "false"),
            # 粒度配置
            "db_format": os.environ.get("SHARDING_DB_FORMAT", "%Y%m%d"),
            "table_format": os.environ.get("SHARDING_TABLE_FORMAT", "%Y%m%d"),
            # 连接池配置
            "pool_size": _get_int("SHARDING_POOL_SIZE", 10),
            "max_overflow": _get_int("SHARDING_MAX_OVERFLOW", 20),
            "pool_recycle": _get_int("SHARDING_POOL_RECYCLE", 3600),
            "pool_timeout": _get_int("SHARDING_POOL_TIMEOUT", 30),
            "pool_pre_ping": _get_bool("SHARDING_POOL_PRE_PING", "true"),
        }

    # ==================== LDAP 认证配置 ====================
    AUTH_USE_LDAP       = _get_bool("AUTH_USE_LDAP", "false")
    LDAP_API_BASE       = os.environ.get("LDAP_API_BASE", "")
    LDAP_SERVICE_NAME   = os.environ.get("LDAP_SERVICE_NAME", "")
    LDAP_LOCATION       = os.environ.get("LDAP_LOCATION", "TW")

    # ==================== 钉钉通知配置 ====================
    DINGTALK_API_BASE           = os.environ.get("DINGTALK_API_BASE", "")
    DINGTALK_SERVICE_NAME       = os.environ.get("DINGTALK_SERVICE_NAME", "")
    DINGTALK_SERVICE_TYPE       = os.environ.get("DINGTALK_SERVICE_TYPE", "Web")
    DINGTALK_TOKEN              = os.environ.get("DINGTALK_TOKEN", "")
    DINGTALK_SAME_ALARM_INTER   = _get_int("DINGTALK_SAME_ALARM_INTER", 5)

    # ==================== Celery 配置 ====================
    # Broker 地址（消息代理，默认使用 Redis 的 DB 1）
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "")
    # Result Backend 地址（结果存储，默认使用 Redis 的 DB 2）
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "")
    # 结果过期时间（秒，默认 1 小时）
    CELERY_RESULT_EXPIRES = _get_int("CELERY_RESULT_EXPIRES", 3600)
    # 任务序列化方式（json/pickle/yaml）
    CELERY_TASK_SERIALIZER = os.environ.get("CELERY_TASK_SERIALIZER", "json")
    CELERY_RESULT_SERIALIZER = os.environ.get("CELERY_RESULT_SERIALIZER", "json")
    # 时区设置
    CELERY_TIMEZONE = os.environ.get("CELERY_TIMEZONE", "Asia/Shanghai")
    CELERY_ENABLE_UTC = _get_bool("CELERY_ENABLE_UTC", "false")
    # 任务超时配置（秒）
    CELERY_TASK_TIME_LIMIT = _get_int("CELERY_TASK_TIME_LIMIT", 3600)
    CELERY_TASK_SOFT_TIME_LIMIT = _get_int("CELERY_TASK_SOFT_TIME_LIMIT", 3000)
    # Worker 配置
    CELERY_WORKER_PREFETCH_MULTIPLIER = _get_int("CELERY_WORKER_PREFETCH_MULTIPLIER", 4)
    CELERY_WORKER_MAX_TASKS_PER_CHILD = _get_int("CELERY_WORKER_MAX_TASKS_PER_CHILD", 1000)

    # ==================== RabbitMQ 配置 ====================
    # RabbitMQ 服务器地址
    RABBITMQ_HOST = os.environ.get("RABBITMQ_HOST", "127.0.0.1")
    RABBITMQ_PORT = _get_int("RABBITMQ_PORT", 5672)
    RABBITMQ_USERNAME = os.environ.get("RABBITMQ_USERNAME", "guest")
    RABBITMQ_PASSWORD = _get_secret("RABBITMQ_PASSWORD", "guest")
    RABBITMQ_VIRTUAL_HOST = os.environ.get("RABBITMQ_VIRTUAL_HOST", "/")
    # 连接超时（秒）
    RABBITMQ_CONNECTION_TIMEOUT = _get_int("RABBITMQ_CONNECTION_TIMEOUT", 10)
    # 心跳超时（秒）
    RABBITMQ_HEARTBEAT = _get_int("RABBITMQ_HEARTBEAT", 600)
