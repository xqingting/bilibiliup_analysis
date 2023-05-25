import requests
import json

# 输入验证函数，确保输入为数字
def validate_input(prompt):
    while True:
        user_input = input(prompt)
        if user_input.isdigit():
            return int(user_input)
        else:
            print("输入错误，请输入一个数字。")

# 获取房间号和主播UID
roomid = validate_input("请输入房间号：")
ruid = validate_input("请输入主播UID：")

group = []
pagelength = 0
url = f"https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid={roomid}&ruid={ruid}&page_size=29&page=1"

response = requests.get(url)
if response.status_code == 200:
    data = response.json()["data"]
    group.extend(data["top3"])
    group.extend(data["list"])
    pagelength = data["info"]["page"]
else:
    print(response.text)

for page in range(2, pagelength + 1):
    url = f"https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid={roomid}&ruid={ruid}&page_size=29&page={page}"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()["data"]
        group.extend(data["list"])
        if len(group) >= data["info"]["num"]:
            filename = f"{roomid}.json"
            with open(filename, "w", encoding="utf-8") as file:
                json.dump({"group": group}, file, indent=2, ensure_ascii=False)
            print(f"数据保存到文件：{filename}")
    else:
        print(response.text)
