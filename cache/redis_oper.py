from cache import redis_client


class OperRedis:
    def __init__(self) -> None:
        self.pipe = redis_client.pipeline()

    def add_str(self, key, value):
        self.pipe.set(key, value)
        self.pipe.execute()

    def add_dict(self, key, data_dict):
        self.pipe.hset(key, mapping=data_dict)
        self.pipe.execute()

    def list_push(self, key, push_var="r", *value):
        if push_var == "r":
            self.pipe.rpush(key, *value)
        elif push_var == "l":
            self.pipe.lpush(key, *value)
        self.pipe.execute()

    def list_get(self, key, start_index=0, end_index=-1):
        return redis_client.lrange(key, start_index, end_index)

    def list_pop(self, key, value="", count=1, pop_var="r"):
        if pop_var == "r":
            self.pipe.rpop(key)
        elif pop_var == "l":
            self.pipe.lpop(key)
        elif pop_var == "m":
            self.pipe.lrem(key, count, value)
        elif pop_var == "a":
            self.pipe.delete(key)
        elif pop_var == "c":
            datalist = self.list_get(key)
            for v in datalist:
                if v == value:
                    self.pipe.lrem(key, count, value)
        self.pipe.execute()

    def list_set(self, key, index, value):
        self.pipe.lset(key, index, value)
        self.pipe.execute()
