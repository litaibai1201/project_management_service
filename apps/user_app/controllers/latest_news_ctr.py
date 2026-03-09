from apps.user_app.models import OperRecordFormModel
from apps.user_app.serializes import UserLstestContentSchema


class UserLatestNewsController:
    def __init__(self) -> None:
        self.OPRFM = OperRecordFormModel()

    def query_user_latest_news_data(self, payload):
        page = payload.get("page", 1)
        page = 1 if page <= 0 else page
        size = payload.get("size", 5)
        latest_record_list = self.OPRFM.query_lastest_record(page, size)
        result = []
        for latest_record in latest_record_list:
            latest_record_ser = UserLstestContentSchema().dump(latest_record)
            result.append(latest_record_ser)

        return result
