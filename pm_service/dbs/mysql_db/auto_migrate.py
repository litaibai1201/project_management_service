# -*- coding: utf-8 -*-
"""
@文件: auto_migrate.py
@说明: 启动时自动同步数据库表结构
       - 新增表：由 db.create_all() 处理
       - 新增列：自动执行 ALTER TABLE ADD COLUMN
       - 不处理列删除、列改名、类型变更（避免数据丢失风险）
"""
import sqlalchemy
from loggers import logger


def _get_column_ddl(col, dialect) -> str:
    """将 SQLAlchemy Column 转换为 MySQL 列定义字符串"""
    col_type = col.type.compile(dialect=dialect)

    # NULL / NOT NULL
    nullable_str = "" if col.nullable else " NOT NULL"

    # DEFAULT 值（仅处理标量默认值；callable/服务端默认跳过）
    default_str = ""
    if col.default is not None and isinstance(col.default, sqlalchemy.ColumnDefault):
        arg = col.default.arg
        if isinstance(arg, (str,)):
            escaped = arg.replace("'", "''")
            default_str = f" DEFAULT '{escaped}'"
        elif isinstance(arg, bool):
            default_str = f" DEFAULT {1 if arg else 0}"
        elif isinstance(arg, (int, float)):
            default_str = f" DEFAULT {arg}"
        # callable（如 generate_uuid / get_now）不设 DB DEFAULT，由应用层填充

    # COMMENT
    comment_str = ""
    if col.comment:
        escaped_comment = col.comment.replace("'", "''")
        comment_str = f" COMMENT '{escaped_comment}'"

    return f"{col_type}{nullable_str}{default_str}{comment_str}"


def auto_migrate(app, db):
    """
    应用启动时自动同步表结构。

    用法（在 create_app 中 db.create_all() 之后调用）：
        from dbs.mysql_db.auto_migrate import auto_migrate
        auto_migrate(app, db)
    """
    with app.app_context():
        # ── 1. 创建尚不存在的新表 ──────────────────────────────────────────
        db.create_all()

        # ── 2. 检查已有表的字段差异，补充缺失列 ────────────────────────────
        inspector = sqlalchemy.inspect(db.engine)
        dialect   = db.engine.dialect
        added     = []
        errors    = []

        for table_name, table in db.metadata.tables.items():
            if not inspector.has_table(table_name):
                # create_all 刚才应已建好；若还没有则跳过（外部数据库可能暂不可达）
                continue

            existing_cols = {col["name"] for col in inspector.get_columns(table_name)}

            for col in table.columns:
                if col.name in existing_cols:
                    continue

                # 构造 ALTER TABLE 语句
                col_ddl = _get_column_ddl(col, dialect)
                sql = f"ALTER TABLE `{table_name}` ADD COLUMN `{col.name}` {col_ddl}"

                try:
                    with db.engine.connect() as conn:
                        conn.execute(sqlalchemy.text(sql))
                        conn.commit()
                    added.append(f"{table_name}.{col.name}")
                    logger.info(
                        f"[AutoMigrate] 新增列: {table_name}.{col.name}  DDL: {col_ddl}",
                        event="auto_migrate_add_column",
                    )
                except Exception as e:
                    errors.append(f"{table_name}.{col.name}: {e}")
                    logger.error(
                        f"[AutoMigrate] 新增列失败: {table_name}.{col.name}",
                        event="auto_migrate_error",
                        error=e,
                    )

        # ── 3. 检查索引，补充缺失索引 ────────────────────────────────────────
        added_indexes = []
        index_errors  = []

        for table_name, table in db.metadata.tables.items():
            if not inspector.has_table(table_name):
                continue

            existing_index_names = {
                idx["name"] for idx in inspector.get_indexes(table_name)
            }

            for index in table.indexes:
                if index.name in existing_index_names:
                    continue

                col_names  = ", ".join(f"`{col.name}`" for col in index.columns)
                unique_str = "UNIQUE " if index.unique else ""
                sql = (
                    f"CREATE {unique_str}INDEX `{index.name}` "
                    f"ON `{table_name}` ({col_names})"
                )
                try:
                    with db.engine.connect() as conn:
                        conn.execute(sqlalchemy.text(sql))
                        conn.commit()
                    added_indexes.append(f"{table_name}.{index.name}")
                    logger.info(
                        f"[AutoMigrate] 新增索引: {table_name}.{index.name}  DDL: {sql}",
                        event="auto_migrate_add_index",
                    )
                except Exception as e:
                    index_errors.append(f"{table_name}.{index.name}: {e}")
                    logger.error(
                        f"[AutoMigrate] 新增索引失败: {table_name}.{index.name}",
                        event="auto_migrate_index_error",
                        error=e,
                    )

        # ── 4. 汇总日志 ──────────────────────────────────────────────────────
        if added:
            logger.info(
                f"[AutoMigrate] 完成，共新增 {len(added)} 列: {', '.join(added)}",
                event="auto_migrate_done",
            )
        else:
            logger.info("[AutoMigrate] 表结构无变更", event="auto_migrate_no_change")

        if added_indexes:
            logger.info(
                f"[AutoMigrate] 共新增 {len(added_indexes)} 个索引: {', '.join(added_indexes)}",
                event="auto_migrate_indexes_done",
            )

        if errors:
            logger.warning(
                f"[AutoMigrate] {len(errors)} 个列操作失败: {'; '.join(errors)}",
                event="auto_migrate_partial_failure",
            )
        if index_errors:
            logger.warning(
                f"[AutoMigrate] {len(index_errors)} 个索引操作失败: {'; '.join(index_errors)}",
                event="auto_migrate_index_partial_failure",
            )
