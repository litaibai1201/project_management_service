import requests
import json

from common.common_tools import TryExcept


class SendMessageNotice:
    @TryExcept("消息发送失敗")
    @staticmethod
    def send_single_markdown(message, user_ids):
        payload = {
            "userids": user_ids,
            "type": "markdown",
            "markdown": json.dumps(
                {
                    "title": "專案管理系統消息通知",
                    "text": message,
                }
            ),
            "same_alarm_inter": 0,
            "service_name": "專案管理系統消息通知",
            "service_type": "Web",
            "token": "dc3e4acc812d36222751d4b6224131f642756219333996a25e165e882ba7bc02",
        }
        url = "http://10.126.1.237:17650/api/sendSingleAlarm"
        res = requests.post(url=url, data=payload)
        code = res.json()["code"]
        return code
