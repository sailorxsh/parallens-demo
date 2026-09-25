import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const source = '/Users/sailorhao/Downloads/用户与设备经营看板-框架版数据底表.xlsx';
const target = '/Users/sailorhao/Documents/Codex/2026-09-24/fen-xi/revised/用户与设备经营看板-修订数据底表.xlsx';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheet = wb.worksheets.getItem('框架版底表');
const guide = wb.worksheets.getItem('框架导览');
const entity = wb.worksheets.getItem('基础实体定义');

// Read-only visual baseline before the first edit.
const baseline = await wb.render({sheetName: '框架版底表', range: 'A1:G7', scale: 1, format: 'png'});
await fs.writeFile('/Users/sailorhao/Documents/Codex/2026-09-24/fen-xi/revised/source-preview.png', new Uint8Array(await baseline.arrayBuffer()));

const put = (s, addr, value) => { s.getRange(addr).values = [[value]]; };
put(sheet, 'A2', '54条配置记录：全局筛选1条、指标53条。修订口径以本表及基础实体定义为准；Q/R列分别记录诊断页与首页展示。');
put(sheet, 'Q3', '诊断页');
put(sheet, 'R3', '首页默认展示');

const pageFor = (index, block) => {
  if (index === 1) return '全局';
  if (index === 2 || index === 3 || index === 5 || index === 6 || index === 17 || index === 18 || index === 19 || index === 20 || index === 21 || index === 22 || index === 23 || index === 32 || index === 33 || index === 52) return 'D';
  if (index === 4 || index === 24 || (index >= 25 && index <= 31)) return 'B';
  if (index === 7 || index === 9 || index === 10 || index === 11 || index === 12 || index === 13 || index === 14 || index === 15 || index === 16) return 'A';
  if (index === 8 || (index >= 41 && index <= 47)) return 'C';
  if (index >= 34 && index <= 40) return 'E';
  if (index >= 48 && index <= 51) return 'F';
  if (index >= 53) return 'G';
  if (block === '预警与行动区') return 'D';
  throw new Error(`Unmapped indicator ${index}`);
};
const home = new Map([
  [2,'快照·有效订阅'],[3,'快照·MRR'],[4,'快照·复合活跃'],
  [9,'N1'],[11,'N2'],[13,'N3'],[18,'N4'],[23,'N5'],[34,'N6'],
  [41,'地基·设备活跃'],[42,'地基·空触发'],[48,'地基·多设备'],[49,'地基·共享'],
  [15,'预警·未激活'],[52,'预警·高危'],[29,'预警·沉睡'],[22,'预警·Free用满'],
]);
const rows = sheet.getRange('A4:B57').values;
const mapping = rows.map(([index, block]) => [pageFor(index, block), home.get(index) ?? '否']);
sheet.getRange('Q4:R57').values = mapping;
sheet.getRange('Q3:R3').copyFrom(sheet.getRange('O3:P3'), 'all');
put(sheet, 'Q3', '诊断页'); put(sheet, 'R3', '首页默认展示');
sheet.getRange('Q4:R57').copyFrom(sheet.getRange('O4:P57'), 'all');
sheet.getRange('Q4:R57').values = mapping;
sheet.getRange('Q1:R57').format.columnWidth = 16;
sheet.getRange('Q3:R3').format = {fill:'#17324D',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true};
sheet.getRange('Q4:R57').format.font = {name:'Arial',size:10,color:'#253447'};
sheet.getRange('Q4:R57').format.wrapText = true;

put(sheet,'E11','分别展示历史首次产出内容的设备数与当前仍绑定的设备数；两者口径不同，差值不能代表激活后解绑设备数。');
put(sheet,'N11','设备资产规模；激活后未绑定设备须按历史激活与当前绑定关系的交集直接统计。');
put(sheet,'F16','7日价值激活率＝注册后完整观察满7日、且7日内达成价值激活的观鸟线新注册用户÷已满7日观察期的观鸟线新注册用户。狩猎线定义未确认时不适用。');
put(sheet,'F20','试用开启率＝注册后7天内开启试用的新注册用户÷进入完整7日观察期的新注册用户；若需分析其他开启窗口，单独标注。');
put(sheet,'F8','状态条以有效主账号为全集，逐日互斥归类。观鸟线：Free/试用中·早期（剩余>3天）/试用中·临期（剩余≤3天）/付费中/已取消未到期/支付失败；狩猎线以无权益替代Free，另含已过期。归类优先级：试用、有效付费（其中已取消未到期单列）、支付失败、已过期、Free或无权益。付费权益有效人数包含已取消未到期且尚有权益者；支付失败是否仍有权益须依据宽限期状态判定。');
put(sheet,'F22','首次订阅率＝绑定完成后30天内首次成功付费的主账号÷进入完整30天观察期、绑定时从未订阅过的可订阅主账号；默认按首次绑定批次，设备激活批次作为单独切换视图。');
put(sheet,'G22','默认按首次绑定批次展示30天首次订阅率；显示可订阅用户、首次付费用户及近12周趋势。');
put(sheet,'F25','AI识别用满率＝消耗≥30次/月的Free用户占比；存储占用率＝≥1GB占比；影像传输用满率＝≥20次/月占比。首页“Free权益用满用户数”＝当月任一权益达到对应阈值的去重Free主账号数。');
put(sheet,'G25','三项消耗率趋势＋任一权益用满的去重用户数与清单入口。');
put(sheet,'D32','季节阈值未使用用户与回流');
put(sheet,'E32','看有多少主账号达到当前季节的未使用阈值，以及其中多少用户随后重新活跃。');
put(sheet,'G32','显示迁徙季21天/淡季30天未使用用户数与占比、回流用户数与回流率；图表标题随季节切换。');
put(sheet,'M35','二级页D诊断');
put(sheet,'M39','二级页E诊断');
put(sheet,'K38','上下两张共用月份轴的趋势图：付费人数与ARPPU');
put(sheet,'L48','国家→WiFi环境/设备型号→固件版本→设备');
put(sheet,'F55','流失高危＝意图层 ∪（行为层 ∩（设备层 ∪ 触达层 ∪ 态度层））；同一主账号去重。演示原型仅展示模拟名单，不触达真实用户。');
put(sheet,'F57','事件丢失率＝1−实际入库事件数/预期事件数；ID-Mapping覆盖率＝uuid↔device_id成功关联记录÷总记录。仅在预期事件数可可靠估计时计算丢失率；否则标为待核验。');
put(sheet,'G6','区块0主数字+近12个月趋势；演示数据仅有12周时展示12周趋势；基础订阅MRR与增值Pack MRR分列。');
put(sheet,'F6','MRR＝Σ当期有效月付套餐价格＋Σ(当期有效年付套餐价格/12)＋Σ当期有效增值Pack月价；基础订阅与增值Pack分列后汇总，不含试用和Free。');
put(sheet,'F24','期末有效订阅用户＝期初有效订阅用户＋首次付费（试用转正＋直购）＋恢复订阅－失去有效付费权益的用户；同一用户期内多次状态变更按状态流水处理，净增与期初/期末快照核对。');
put(sheet,'G24','显示期初、首次付费（试用转正/直接购买）、恢复订阅、流失、期末及近12周变化。');
put(sheet,'M12','主数字（新增注册）；72h绑定率在A页');
put(sheet,'M13','二级页A诊断');
put(sheet,'M15','二级页A诊断');
put(sheet,'M17','二级页D诊断');
put(sheet,'M35','二级页D诊断');
put(sheet,'M39','二级页E诊断');

put(guide,'A2','主北极星：有效订阅用户规模；期末＝期初＋首次付费＋恢复订阅－流失。过程指标按各自人群与窗口诊断，不相乘推算库存。');
put(guide,'A3','主线：N1→N6为经营导航。节点指标单位及分母可不同；只有同批、同单位、包含关系成立的步骤才计算转化率。');
put(guide,'C7','72h绑定率在A页按注册批次验算');
put(guide,'C8','7天首图激活率在A页按注册批次验算');
put(guide,'C9','试用开启率在D页按完整观察期验算');
put(guide,'C10','试用转正率按到期批次验算；非N4/N5相除');
put(guide,'C11','升级率/Pack渗透率在D/E页独立计算');
put(guide,'B7','周新增注册');
put(guide,'B8','首次绑定成功率');
put(guide,'B9','观鸟线7日价值激活率');
put(guide,'B10','试用→转正率');
put(guide,'B11','续订率');
put(guide,'B12','付费用户');
put(guide,'D9','演示阈值；狩猎线不适用');
put(guide,'A15','预警与行动区：4个首页入口；底表新增指标1条，另3条复用');

put(entity,'B11','观鸟线：首张AI识别出鸟种的内容，或首次直播观看；注册后7日内达成记为“7日价值激活”。狩猎线价值激活事件须另行确认，未确认时显示不适用。');
put(entity,'C13','心跳只用于在线判定，不计入设备活跃分子。');
put(entity,'B19','迁徙季与淡季；未使用阈值分别为21天、30天。未达到完整观察期的对象不进入分母；季节按快照日标记。');

wb.recalculate();
const edited = await wb.render({sheetName:'框架版底表',range:'M1:R7',scale:1,format:'png'});
await fs.writeFile('/Users/sailorhao/Documents/Codex/2026-09-24/fen-xi/revised/revised-preview.png',new Uint8Array(await edited.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(target);
console.log(JSON.stringify({target, mapped:mapping.length, home:home.size}));
