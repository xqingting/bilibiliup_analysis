import json
import os
from tkinter import Tk, filedialog
import sys

def select_file():
    root = Tk()
    root.withdraw()
    file_path = filedialog.askopenfilename()
    if not file_path:
        print("文件选择被取消，程序退出。")
        sys.exit()
    return file_path

def merge_json_files():
    # 选择文件a
    print("请选择文件a：")
    file_a = select_file()

    # 选择文件b
    print("请选择文件b：")
    file_b = select_file()

    # 读取文件a和文件b的JSON数据
    with open(file_a, 'r', encoding='utf-8') as f1, open(file_b, 'r', encoding='utf-8') as f2:
        json_data_a = json.load(f1)
        json_data_b = json.load(f2)

    merged_data = {**json_data_a, **json_data_b}

    # 获取file_a的文件名（不包含扩展名）
    file_a_name = os.path.splitext(os.path.basename(file_a))[0]

    # 构建输出文件名
    output_file_name = os.path.join(os.path.dirname(file_a), f"{file_a_name}_融合.json")

    with open(output_file_name, 'w', encoding='utf-8') as output:
        json.dump(merged_data, output, ensure_ascii=False)

    # 打印file_a、file_b和融合后的JSON的成员数量
    print(f"文件a（{file_a}）的成员数量：{len(json_data_a)}")
    print(f"文件b（{file_b}）的成员数量：{len(json_data_b)}")
    print(f"融合后的JSON的成员数量：{len(merged_data)}")

merge_json_files()
