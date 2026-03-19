ENV = "PROD"  # TEST/PROD

environment_dict = {
    "DB": {
        "TEST": "project_management_test",
        "PROD": "project_management",
    },
    "BUCKET": {
        "TEST": "projectmanagementtest",
        "PROD": "projectmanagement",
    },
}

send_message_link = {
    "TEST": "http://10.86.150.164:5173/",
    "PROD": "http://pm.ai.eavarytech.com/",
}
