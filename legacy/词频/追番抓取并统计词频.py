import os
import json
import httpx
import PySimpleGUI as sg

def uni2Chinese(unicode_str):
    decoded_str = unicode_str.encode().decode('UTF-8')
    return decoded_str

def calcu(vmid_array):
    def calculate_tname_frequency(vmid):
        params = {
            "mid": vmid
        }

        response = httpx.get("https://space.bilibili.com/ajax/Bangumi/getList", params=params)

        if response.status_code == 200 and response.json()["status"] == True:
            data = response.json()["data"]
            video_list = data["result"]

            # 统计词频的字典
            word_frequency = {}

            for video in video_list:
                tname = video.get("title")

                if tname:
                    # 将字段tname加入词频字典
                    word_frequency[tname] = word_frequency.get(tname, 0) + 1

            return word_frequency

        return {}

    from concurrent.futures import ThreadPoolExecutor, as_completed

    # 统计总词频的字典
    total_word_frequency = {}

    # 对每个vmid调用函数并累积词频
    all = len(vmid_array)
    count = 0
    with ThreadPoolExecutor(max_workers=150) as executor:
        future_to_vmid = {executor.submit(calculate_tname_frequency, vmid): vmid for vmid in vmid_array}
        for future in as_completed(future_to_vmid):
            vmid = future_to_vmid[future]
            try:
                result = future.result()
            except Exception as exc:
                print(f"Error occurred while fetching vmid {vmid}: {exc}")
            else:
                count += 1
                print(f"已处理{count}/{all}个vmid")
                # 累积词频到总词频字典
                for word, frequency in result.items():
                    total_word_frequency[word] = total_word_frequency.get(word, 0) + frequency

    # 对词频进行排序
    sorted_word_frequency = sorted(total_word_frequency.items(), key=lambda x: x[1], reverse=True)
    text = ""
    # 打印所有成员的词频统计结果
    for word, frequency in sorted_word_frequency:
        text += f"{word}: {frequency}\n"
        
    return text



def process_file(file_path):
    lines = []
    file_extension = os.path.splitext(file_path)[1].lower()
    if file_extension == ".txt":
        with open(file_path, 'r') as file:
            for line in file:
                lines.append(line.strip())
    elif file_extension == ".json":
        with open(file_path, 'r') as file:
            data = json.load(file)
            if isinstance(data, list):
                lines = data
            elif isinstance(data, dict):
                lines = list(data.values())
    vmid_array.extend(lines)  # 将输出写入vmid_array
    text = calcu(vmid_array)  # 调用calcu函数
    file_name = os.path.basename(file_path)
    output_file = os.path.join(os.path.dirname(file_path), f"{os.path.splitext(file_name)[0]}_追番处理.txt")
    with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
        outfile.write(text)
    return text

if __name__ == "__main__":
    sg.theme("DefaultNoMoreNagging")
    layout = [
        [sg.Text("选择文件处理")],
        [sg.Input(key="-FILE-", enable_events=True, visible=False),
         sg.FileBrowse("上传文件", key="-BROWSE-", file_types=(("Text Files", "*.txt"), ("JSON Files", "*.json")), size=(30, 1))],
        [sg.Button("退出", size=(30, 1))],
    ]
    window = sg.Window("阿b爬取", layout, size=(280, 100), finalize=True)
    sg.set_options(font=("Arial", 12))

    vmid_array = []  # 存储vmid的数组

    while True:
        event, values = window.read()
        if event == sg.WINDOW_CLOSED or event == "退出":
            break
        elif event == "-FILE-":
            file_path = values["-BROWSE-"]
            window["-FILE-"].update(file_path)
            print(process_file(file_path))  # 将输出写入vmid_array

        window.close()
        print("程序已退出！")