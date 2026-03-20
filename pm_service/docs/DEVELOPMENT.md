# Flask Web 开发框架 - 开发规范文档

## 1. 代码规范

### 1.1 文件命名规范

#### Python 文件
- 使用小写字母和下划线：`user_controller.py`
- 类名使用大驼峰：`UserController`
- 模块名使用小写：`auth.py`

#### 配置文件
- 环境特定配置：`development.py`, `production.py`
- 基础配置：`base.py`
- 环境变量模板：`.env.example`

### 1.2 代码风格规范

#### 导入顺序
```python
# 1. 标准库导入
import os
import sys
from typing import Dict, List

# 2. 第三方库导入
from flask import Flask, request
from sqlalchemy import create_engine

# 3. 本地模块导入
from configs.base import BaseConfig
from utils.response import response_result
```

#### 函数注释规范
```python
def search_user(user_id: int, include_inactive: bool = False) -> Dict:
    """
    根据用户ID查询用户信息
    
    Args:
        user_id: 用户ID
        include_inactive: 是否包含非活跃用户
        
    Returns:
        用户信息字典
        
    Raises:
        ResourceNotFoundException: 用户不存在时抛出
    """
    # 函数实现
    pass
```

#### 类注释规范
```python
class UserController:
    """
    用户业务逻辑控制器
    
    职责：
    - 用户信息管理
    - 用户权限验证
    - 用户操作日志记录
    """
    
    def __init__(self):
        """初始化控制器"""
        self.user_model = UserModel()
```

### 1.3 异常处理规范

#### 自定义异常
```python
class BusinessException(Exception):
    """业务异常基类"""
    
    def __init__(self, message: str, code: int = 400):
        self.message = message
        self.code = code
        super().__init__(self.message)

class ValidationException(BusinessException):
    """参数验证异常"""
    
    def __init__(self, message: str, errors: Dict = None):
        super().__init__(message, 400)
        self.errors = errors or {}
```

#### 异常处理最佳实践
```python
try:
    result = user_controller.create_user(user_data)
except ValidationException as e:
    return response_result(
        success=False, 
        message=e.message,
        errors=e.errors,
        code=400
    )
except DatabaseException as e:
    logger.error(f"数据库操作失败: {str(e)}")
    return response_result(
        success=False,
        message="系统内部错误",
        code=500
    )
```

## 2. 开发流程

### 2.1 新功能开发流程

#### 步骤1: 需求分析
- 明确功能需求
- 设计 API 接口
- 确定数据模型

#### 步骤2: 数据库设计
- 设计表结构
- 创建迁移脚本
- 更新模型定义

#### 步骤3: 代码实现
```
1. 创建 Model 层 (models/)
2. 创建 Controller 层 (controllers/) 
3. 创建 View 层 (views/)
4. 创建序列化器 (serializes/)
5. 注册路由 (urls/routes.py)
```

#### 步骤4: 测试验证
- 单元测试
- 集成测试
- API 测试

#### 步骤5: 文档更新
- 更新 API 文档
- 更新 README
- 更新架构文档

### 2.2 API 开发规范

#### RESTful API 设计
```python
# GET /api/users - 获取用户列表
@blp.route("/users")
class UserListAPI(MethodView):
    def get(self):
        """获取用户列表"""
        pass

# POST /api/users - 创建用户
@blp.route("/users")
class UserListAPI(MethodView):
    def post(self):
        """创建用户"""
        pass

# GET /api/users/{id} - 获取用户详情
@blp.route("/users/<int:user_id>")
class UserDetailAPI(MethodView):
    def get(self, user_id):
        """获取用户详情"""
        pass
```

#### 参数校验规范
```python
from marshmallow import Schema, fields, validate

class UserCreateSchema(Schema):
    """用户创建参数校验"""
    
    username = fields.Str(
        required=True,
        validate=validate.Length(min=3, max=50),
        metadata={"description": "用户名"}
    )
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=6))
```

## 3. 测试规范

### 3.1 测试文件结构
```
tests/
├── __init__.py
├── conftest.py          # 测试配置
├── test_models/         # 模型测试
├── test_controllers/    # 控制器测试
├── test_apis/           # API 测试
└── test_utils/          # 工具测试
```

### 3.2 测试用例编写规范
```python
import pytest
from unittest.mock import Mock, patch

class TestUserController:
    """用户控制器测试"""
    
    def setup_method(self):
        """测试前置设置"""
        self.controller = UserController()
        self.mock_user_data = {
            "username": "testuser",
            "email": "test@example.com"
        }
    
    def test_create_user_success(self):
        """测试用户创建成功"""
        # 模拟数据库操作
        with patch.object(self.controller.user_model, 'create') as mock_create:
            mock_create.return_value = True
            
            result = self.controller.create_user(self.mock_user_data)
            
            assert result is True
            mock_create.assert_called_once_with(self.mock_user_data)
    
    def test_create_user_validation_failed(self):
        """测试用户创建参数验证失败"""
        invalid_data = {"username": "ab"}  # 用户名过短
        
        with pytest.raises(ValidationException) as exc_info:
            self.controller.create_user(invalid_data)
        
        assert "用户名长度必须在3到50个字符之间" in str(exc_info.value)
```

### 3.3 测试覆盖率要求
- 模型层: ≥90%
- 控制器层: ≥85% 
- API 层: ≥80%
- 工具类: ≥95%

## 4. 日志规范

### 4.1 日志级别定义
```python
import logging

# 日志级别
logger.debug("调试信息")      # 详细的调试信息
logger.info("普通信息")       # 正常的系统运行信息
logger.warning("警告信息")    # 警告信息，不影响系统运行
logger.error("错误信息")      # 错误信息，需要关注
logger.critical("严重错误")   # 严重错误，系统可能无法运行
```

### 4.2 结构化日志格式
```python
# 好的日志示例
logger.info(
    "用户登录成功",
    extra={
        "user_id": 123,
        "ip": "192.168.1.1",
        "action": "login"
    }
)

# 避免的日志示例
logger.info(f"用户 {user_id} 从 {ip} 登录成功")  # 不利于日志分析
```

## 5. 安全规范

### 5.1 密码安全
```python
from werkzeug.security import generate_password_hash, check_password_hash

class UserController:
    def create_user(self, user_data):
        # 密码哈希处理
        user_data['password_hash'] = generate_password_hash(user_data['password'])
        del user_data['password']  # 删除明文密码
        
        return self.user_model.create(user_data)
    
    def verify_password(self, plain_password, hashed_password):
        return check_password_hash(hashed_password, plain_password)
```

### 5.2 SQL 注入防护
```python
# 安全的方式 - 使用参数化查询
safe_query = db.session.query(User).filter(User.username == username)

# 危险的方式 - 字符串拼接（绝对禁止）
unsafe_query = f"SELECT * FROM users WHERE username = '{username}'"
```

### 5.3 XSS 防护
```python
from markupsafe import escape

# 对用户输入进行转义
def render_user_content(content):
    return escape(content)  # 转义 HTML 特殊字符
```

## 6. 性能优化规范

### 6.1 数据库优化
```python
# 使用延迟加载避免 N+1 查询问题
users = db.session.query(User).all()
for user in users:
    print(user.posts)  # 每次访问都会产生新的查询

# 使用预加载优化
users = db.session.query(User).options(joinedload(User.posts)).all()
for user in users:
    print(user.posts)  # 一次性加载所有关联数据
```

### 6.2 缓存优化
```python
from utils.cache_decorator import cache_result

class UserController:
    @cache_result(key="user:{user_id}", timeout=300)
    def get_user(self, user_id):
        """获取用户信息，结果缓存5分钟"""
        return self.user_model.get_by_id(user_id)
```

### 6.3 异步处理
```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

class AsyncController:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=10)
    
    async def process_batch(self, items):
        """异步批量处理"""
        loop = asyncio.get_event_loop()
        
        # 将阻塞操作放到线程池执行
        tasks = [
            loop.run_in_executor(self.executor, self.process_item, item)
            for item in items
        ]
        
        return await asyncio.gather(*tasks)
```

## 7. 部署规范

### 7.1 环境配置

```bash
# 开发环境
FLASK_ENV=development
MYSQL_HOST=localhost
MYSQL_DATABASE=dev_db
MYSQL_USERNAME=root
MYSQL_PASSWORD=your_password

# 生产环境
FLASK_ENV=production
MYSQL_HOST=prod-db
MYSQL_DATABASE=prod_db
REDIS_HOST=redis-server
```

### 7.2 Windows 部署（Waitress）

Waitress 是纯 Python 实现的 WSGI 服务器，跨平台，**推荐用于 Windows 生产环境**，已包含在 `requirements.txt` 中。

```bash
# 基本启动
waitress-serve --port=19999 --call app:create_app

# 指定线程数（默认 4）
waitress-serve --port=19999 --threads=8 --call app:create_app

# 绑定指定 IP
waitress-serve --listen=0.0.0.0:19999 --threads=8 --call app:create_app
```

注册为 Windows 服务（使用 NSSM）：

```bat
:: 下载 nssm.exe 后执行
nssm install MyFlaskApp "waitress-serve" "--port=19999 --call app:create_app"
nssm set MyFlaskApp AppDirectory "C:\path\to\app_project_small"
nssm set MyFlaskApp AppEnvironmentExtra "FLASK_ENV=production"
nssm start MyFlaskApp
```

### 7.3 Linux 部署（Gunicorn）

Gunicorn 是 Linux/macOS 下主流的 WSGI 服务器，支持多进程，**推荐用于 Linux 生产环境**。

```bash
pip install gunicorn

# 基本启动（4 个 worker 进程）
gunicorn -w 4 -b 0.0.0.0:19999 "app:create_app()"

# 推荐生产配置
gunicorn \
  -w 4 \
  -b 0.0.0.0:19999 \
  --timeout 120 \
  --access-logfile logs/access.log \
  --error-logfile logs/error.log \
  --log-level info \
  "app:create_app()"
```

使用 systemd 管理进程：

```ini
# /etc/systemd/system/flask-app.service
[Unit]
Description=Flask App
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/app_project_small
EnvironmentFile=/opt/app_project_small/.env
ExecStart=/opt/venv/bin/gunicorn -w 4 -b 0.0.0.0:19999 "app:create_app()"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable flask-app
systemctl start flask-app
systemctl status flask-app
```

### 7.4 异步接口部署（Hypercorn / Uvicorn）

Flask 3 支持 `async` 视图函数，但 Gunicorn/Waitress 是 WSGI 服务器，无法充分发挥异步性能。
若项目中有 `async` 视图，生产环境应使用 ASGI 服务器：

```bash
pip install hypercorn
# 或
pip install uvicorn[standard]

# Hypercorn（推荐，与 Flask 3 兼容性最佳）
hypercorn app:create_app -b 0.0.0.0:19999 -w 4

# Uvicorn
uvicorn "app:create_app" --host 0.0.0.0 --port 19999 --workers 4
```

### 7.5 Docker 部署

**Dockerfile（同步版本，使用 Waitress）：**

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# 安装依赖（利用 Docker 缓存层）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 19999

CMD ["waitress-serve", "--listen=0.0.0.0:19999", "--threads=8", "--call", "app:create_app"]
```

**Dockerfile（异步版本，使用 Hypercorn）：**

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt hypercorn

COPY . .

EXPOSE 19999

CMD ["hypercorn", "app:create_app", "-b", "0.0.0.0:19999", "-w", "4"]
```

**docker-compose.yml（含 MySQL + Redis）：**

```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "19999:19999"
    environment:
      FLASK_ENV: production
      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_DATABASE: app_db
      MYSQL_USERNAME: root
      MYSQL_PASSWORD: your_password
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: your_password
      MYSQL_DATABASE: app_db
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  mysql_data:
  redis_data:
```

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f app

# 停止
docker compose down
```

## 8. 代码审查 checklist

### 8.1 功能实现检查
- [ ] 功能需求是否完整实现
- [ ] 边界条件是否处理
- [ ] 错误处理是否完善
- [ ] 性能是否满足要求

### 8.2 代码质量检查
- [ ] 代码是否符合规范
- [ ] 注释是否清晰完整
- [ ] 测试用例是否覆盖
- [ ] 安全风险是否排查

### 8.3 文档更新检查
- [ ] API 文档是否更新
- [ ] README 是否更新
- [ ] 变更记录是否添加
- [ ] 部署说明是否更新