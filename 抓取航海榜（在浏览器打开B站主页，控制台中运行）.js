const roomid = 22637261; // 房间号,可以改
const ruid = 672328094; // 主播uid,可以改
let group = [];
let pagelength, url, number;

async function fetchData() {
  url = `https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid=${roomid}&ruid=${ruid}&page_size=29&page=1`;
  const response = await fetch(url);
  if (!response.ok) {
    console.log(response.statusText);
    return;
  }
  const data = await response.json();
  group.push(...data.data.top3);
  group.push(...data.data.list);
  pagelength = data.data.info.page;
  number = data.data.info.num;

  for (let page = 2; page <= pagelength; page++) {
    url = `https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topList?roomid=${roomid}&ruid=${ruid}&page_size=29&page=${page}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.log(response.statusText);
      return;
    }
    const data = await response.json();
    group.push(...data.data.list);
    if (group.length >= number) {
      const json = JSON.stringify({ group }, null, 2);
      await saveToFile(json);
    }
  }
}

async function saveToFile(json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'output.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

fetchData();