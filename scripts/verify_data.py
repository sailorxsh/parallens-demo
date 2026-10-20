"""Dashboard data contract checks, independent from the renderer."""
from __future__ import annotations

import json
import runpy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
load = lambda name: json.loads((DATA / name).read_text(encoding="utf-8"))
catalog = load("metric-catalog.json")
metrics = load("metric-values.json")
weekly = load("weekly.json")
snapshot = load("snapshot.json")
stories = load("stories.json")
pages = load("page-data.json")
diagnostics = load("diagnostics.json")
contract = load("filter-contract.json")
slices = load("filter-slices.json")
entity_samples = load("entity-samples.json")
metric_trends = load("metric-trends.json")
function_usage = load("function-usage.json")
inactivity = load("inactivity-cohorts.json")
technical = load("technical-facts.json")
subscription_flow = load("subscription-flow.json")
binding_devices = load("binding-device-facts.json")
device_activity = load("device-activity-facts.json")
onboarding = load("onboarding-duration-facts.json")
filter_policy = load("filter-policy.json")
model_market = load("model-market.json")
monthly_renewal = load('monthly-renewal-facts.json')
checks = []


def check(rule: str, condition: bool, detail: str) -> None:
    checks.append({"rule": rule, "passed": bool(condition), "detail": detail})


check("catalog", len(catalog) == 54 and len(metrics) == 53 and
      {x["id"] for x in catalog} == set(range(1,55)) and
      {x["page"] for x in catalog[1:]} == set("ABCDEFG"),
      "54条记录、53条指标、七个诊断页归属")
check("catalog-pages", sum(len(x) for x in pages.values()) == 53 and
      all(next(i for i in catalog if i["id"] == x["metricId"])["page"] == page
          for page, records in pages.items() for x in records), "分页引用与指标目录一致")
check("F1-filter-contract", len(contract) == 53 and
      {item["id"] for item in contract} == set(range(2,55)) and
      all(item["page"] == next(row["page"] for row in catalog if row["id"] == item["id"])
          and item["entity"] and item["window"] and item["formula"] and item["source"] and item["unsupported"]
          and set(item["dimensions"]).issubset(set(slices) | {"week"}) for item in contract),
      "53项指标均有对象、窗口、公式、适用维度及不适用规则")
policy_metrics = {item["id"]: item for item in filter_policy["metrics"]}
check("F9-business-filter-policy", len(policy_metrics) == 53 and
      set(policy_metrics) == set(range(2, 55)) and
      "userType" not in filter_policy["controls"] and
      all(set(item["demonstrableDimensions"]) <= set(item["businessDimensions"]) and
          set(item["unavailableDimensions"]) ==
          set(item["businessDimensions"]) - set(item["demonstrableDimensions"])
          for item in policy_metrics.values()) and
      "Starter" in filter_policy["controls"]["plan"]["optionsByProduct"]["Hunting"] and
      "Starter" not in filter_policy["controls"]["plan"]["optionsByProduct"]["Bird"],
      "53项业务适用性与演示能力分离；正式账号不是试用状态，Starter仅狩猎线")
model_rows = model_market["records"]
check("F10-model-market-facts", len(model_rows) == 16 and
      len({(row["country"], row["model"]) for row in model_rows}) == 16 and
      all(0 <= row["subscribedOwners"] <= row["owners"] and
          0 <= row["activeOwners"] <= row["owners"] for row in model_rows) and
      all(sum(row["owners"] for row in model_rows if row["model"] == model) == value["owners"] and
          sum(row["activeOwners"] for row in model_rows if row["model"] == model) == round(value["owners"] * value["activeRate"]) and
          sum(row["subscribedOwners"] for row in model_rows if row["model"] == model) == round(value["owners"] * value["subscriptionRate"])
          for model, value in metrics["m39"]["value"].items()),
      "型号主账号在四市场互斥闭合，活跃与订阅人数均能回算")
check("F2-synthetic-slices", all(
      abs(sum(option["denominatorShare"] for option in values.values()) - 1) < 1e-7 and
      abs(sum(option["numeratorShare"] for option in values.values()) - 1) < 1e-6 and
      all(0 < option["denominatorShare"] <= 1 and 0 < option["numeratorShare"] <= 1
          for option in values.values()) for values in slices.values()),
      "各模拟维度的分母与分子分片独立闭合为100%")
check("F5-function-denominator", function_usage["denominator"] == metrics["m27"]["denominator"] and
      function_usage["functions"]["Live"]["users"] == metrics["m27"]["numerator"] and
      all(0 < item["users"] <= function_usage["denominator"] for item in function_usage["functions"].values()),
      "功能选择保持同一活跃主账号分母；功能人数不可相加")
check("F6-season-threshold", sum(inactivity["lastActiveDays"].values()) == inactivity["eligibleOwners"] == metrics["m29"]["denominator"] and
      inactivity["lastActiveDays"]["21to29"]+inactivity["lastActiveDays"]["30plus"] == metrics["m29"]["numerator"] and
      all(inactivity["returnsAfterThreshold"][key] <= inactivity["historicalReturnCohort"][key]
          for key in ("21days","30days")),
      "21/30天未使用人数由最近活跃间隔分层求和；回流有独立历史分母")
attempts=sum(row["attempts"] for row in technical["records"])
check("F7-technical-facts", attempts == 10000 and
      attempts-sum(row["networkFailures"] for row in technical["records"]) == metrics["m45"]["value"]["networkSuccess"]["numerator"] and
      all(attempts-sum(row[f"{field}Failures"] for row in technical["records"]) ==
          metrics["m46"]["value"][field]["numerator"] for field in ("upload","live","push")) and
      all(0 <= row[field] <= row["attempts"] for row in technical["records"]
          for field in ("networkFailures","uploadFailures","liveFailures","pushFailures")),
      "型号×固件的联网和三条技术链路成功/失败合计回到原底表")
flow_lines = subscription_flow["byProductLine"]
flow_total = metrics["m21"]["value"]
check("F8-subscription-flow", all(
      line["opening"] + line["trialPaid"] + line["directPaid"] + line["recovered"] - line["lost"] == line["closing"]
      for line in flow_lines.values()) and
      all(sum(line[key] for line in flow_lines.values()) == flow_total[key] for key in flow_total) and
      all(flow_lines[product]["closing"] ==
          snapshot["subscriptionStatuses"][status]["paidCurrent"] +
          snapshot["subscriptionStatuses"][status]["cancelledButEntitled"]
          for product,status in (("Bird","bird"),("Hunting","hunting"))),
      "分产品线订阅流转各自闭合，合计回总体与互斥订阅状态")
status_history = subscription_flow.get("statusHistory", {})
check("D31-subscription-status-history", status_history.get("classification") == "entirely_synthetic" and
      len(status_history.get("rows", [])) == 12 and status_history["rows"][-1]["products"] == metrics["m05"]["value"] and
      all(sum(sum(part.values()) for part in row["products"].values()) == metric_trends["m48"]["points"][i]["denominator"] and
          sum(part["paidCurrent"] + part["cancelledButEntitled"] for part in row["products"].values()) == metric_trends["m02"]["points"][i]["value"]
          for i, row in enumerate(status_history["rows"])),
      "12期状态快照各产品内互斥闭合，当前人数与原始付费/绑定池历史保持")
check("F3-incomparable-rates", len(diagnostics["D"]["chart"]["series"]) == 1 and
      len(diagnostics["D"]["extraCharts"]) >= 1 and
      len(diagnostics["D"]["extraCharts"][0]["series"]) == 1 and
      "1,000" in diagnostics["D"]["chart"]["note"] and
      "200" in diagnostics["D"]["extraCharts"][0]["note"],
      "总体转正率与支付失败率分图、分母分别标注")

def apportioned(total, weights):
    exact = [total * weight / sum(weights) for weight in weights]
    parts = [int(value) for value in exact]
    order = sorted(range(len(parts)), key=lambda index: (-(exact[index] - parts[index]), index))
    for index in order[:total - sum(parts)]:
        parts[index] += 1
    return parts

paid_plan_ids = {2,3,6,17,18,19,21,23,32,33,34,35,52}
allocation_valid = True
for item in contract:
    for component in item["rateComponents"]:
        numerator, denominator = component["numerator"], component["denominator"]
        for dimension in item["dimensions"]:
            if dimension == "week":
                continue
            options = [value for name, value in slices[dimension].items()
                       if not (dimension == "plan" and item["id"] in paid_plan_ids and name == "Free")]
            denominator_weights = [value["denominatorShare"] for value in options]
            numerator_weights = (denominator_weights if numerator / denominator > .9 else
                                 [value["numeratorShare"] for value in options])
            allocated_numerator = apportioned(numerator, numerator_weights)
            allocated_denominator = apportioned(denominator, denominator_weights)
            allocation_valid &= (sum(allocated_numerator) == numerator and
                                 sum(allocated_denominator) == denominator and
                                 all(n <= d for n, d in zip(allocated_numerator, allocated_denominator)))
check("F4-rate-allocation", allocation_valid,
      "单维模拟整数分片闭合到原分子/分母，率的分子不超过分母")
check("R1", len(weekly) == 12 and all(
    w["registrationCohort"]["bound72h"] <= w["registrationCohort"]["eligible"] and
    w["registrationCohort"]["firstImage7d"] <= w["registrationCohort"]["eligible"] and
    w["registrationCohort"]["valueActivated7dBird"] <= w["registrationCohort"]["birdEligible"] and
    w["registrationCohort"]["trialStarted7d"] <= w["registrationCohort"]["eligible"] and
    w["trialMaturity"]["converted"] <= w["trialMaturity"]["completed"] and
    w["renewal"]["successful"] <= w["renewal"]["due"] for w in weekly),
    "仅核对同批次真实子集；不对六节点强制单调")


def all_rates_match(obj):
    if isinstance(obj, dict):
        if obj.get("kind") == "rate":
            return obj["denominator"] > 0 and abs(obj["value"] - obj["numerator"] / obj["denominator"]) < 0.000001
        return all(all_rates_match(value) for value in obj.values())
    if isinstance(obj, list):
        return all(all_rates_match(value) for value in obj)
    return True


check("R2", all_rates_match(metrics) and
      metrics["m10"]["numerator"] == weekly[-1]["registrationCohort"]["bound72h"] and
      metrics["m13"]["denominator"] == weekly[-1]["registrationCohort"]["birdEligible"] and
      metrics["m18"]["numerator"] == weekly[-1]["trialMaturity"]["converted"] and
      metrics["m23"]["numerator"] == monthly_renewal["months"][-1]["renewed"] and metrics["m23"]["denominator"] == monthly_renewal["months"][-1]["due"],
      "全部率可回算；关键率各按已定义完整周或完整月核对")
bird = snapshot["subscriptionStatuses"]["bird"]
hunting = snapshot["subscriptionStatuses"]["hunting"]
check("R3", sum(bird.values()) == snapshot["birdOwners"] and
      sum(hunting.values()) == snapshot["huntingOwners"] and
      snapshot["birdOwners"] + snapshot["huntingOwners"] == snapshot["boundOwnerAccounts"],
      "观鸟57,680、狩猎24,720，各互斥状态闭合到82,400")
check("R4", all(w["activity"]["compositeMAU"] >= w["activity"]["appMAU"]
                for w in weekly) and
      snapshot["compositeMAU"] >= snapshot["appMAU"] and
      metrics["m41"]["numerator"] == snapshot["activeDevices"] and
      metrics["m41"]["denominator"] == snapshot["effectiveActivatedDevices"] and
      weekly[-1]["activity"]["activeDevices"] == snapshot["activeDevices"],
      "复合MAU不小于App MAU；设备活跃仅以有效且已激活设备为分母")
expected = {2:snapshot["effectiveSubscribers"], 3:snapshot["totalMRR"],
            4:snapshot["compositeMAU"], 9:weekly[-1]["registrationCohort"]["registered"],
            15:snapshot["alerts"]["boundNotActivated3d"],
            34:snapshot["paidUsersIncludingPackOnly"],
            52:snapshot["alerts"]["highChurnRisk"]}
check("R5", all(metrics[f"m{index:02}"]["value"] == value for index,value in expected.items()) and
      metrics["m11"]["numerator"] == weekly[-1]["bindingAttempts"]["successful"] and
      metrics["m42"]["numerator"] == weekly[-1]["deviceEventsBird"]["empty"] and
      weekly[-1]["paidUsersIncludingPackOnly"] == snapshot["paidUsersIncludingPackOnly"],
      "首页指标统一取快照或最新周；主要值有对应分页记录")
check("R6", len(weekly) == 12 and all(
    abs(weekly[i]["registrationCohort"]["registered"] /
        weekly[i-1]["registrationCohort"]["registered"] - 1) <= .15
    for i in range(1,12)) and
      abs(sum(metrics["m38"]["value"]["countryShare"].values()) - 1) < .0001,
      "非故事新增用户周波动≤15%；互斥国家构成100%")
paid_status = bird["paidCurrent"] + bird["cancelledButEntitled"] + hunting["paidCurrent"] + hunting["cancelledButEntitled"]
check("R7", paid_status == snapshot["effectiveSubscribers"] and
      bird["free"] / snapshot["birdOwners"] > .82 and
      bird["free"] / snapshot["birdOwners"] < .84,
      "Free不计入有效付费；观鸟Free占比约83%")
check("R8", snapshot["subscribersOpening"] + snapshot["firstPaidFromTrial"] +
      snapshot["firstPaidDirect"] + snapshot["subscriptionRecovered"] -
      snapshot["subscriptionLost"] == snapshot["effectiveSubscribers"] and
      snapshot["subscriptionNetAdd"] == snapshot["effectiveSubscribers"] - snapshot["subscribersOpening"] and
      snapshot["baseMRR"] + snapshot["packMRR"] == snapshot["totalMRR"] and
      metrics["m50"]["value"]["boundActivated"] + metrics["m50"]["value"]["boundNotActivated"] == snapshot["boundDevicesCurrent"] and
      metrics["m50"]["value"]["boundActivated"] + metrics["m50"]["value"]["activatedUnbound"] == snapshot["activatedDevicesCumulative"],
      "订阅、MRR与设备状态交叉核对")
a,b = stories["A"]["baseline"],stories["A"]["issue"]
ba,bb = stories["B"]["baseline"],stories["B"]["issue"]
check("R9-A", a["converted"] == a["segmentConverted"] + a["othersConverted"] and
      b["converted"] == b["segmentConverted"] + b["othersConverted"] and
      a["segmentAttempts"] == b["segmentAttempts"] and
      a["segmentAttempts"] - a["segmentFailed"] == a["segmentConverted"] and
      b["segmentAttempts"] - b["segmentFailed"] == b["segmentConverted"] and
      (a["converted"]-b["converted"]) == (b["segmentFailed"]-a["segmentFailed"]) == 16 and
      a["trialCompleted"] == b["trialCompleted"] == 1000,
      "支付失败多16人，解释总体转正率45.0%→43.4%")
check("R9-B", all(x["allTriggers"] == x["k6Firmware28Triggers"] + x["otherTriggers"] and
                  x["allEmpty"] == x["k6Firmware28Empty"] + x["otherEmpty"] for x in (ba,bb)) and
      ba["allEmpty"] / ba["allTriggers"] == .42 and
      bb["allEmpty"] / bb["allTriggers"] == .58 and
      all(w["deviceEventsBird"]["empty"] == (4200 if w["week"] <= 8 else 5800) for w in weekly),
      "分组加权汇总得到空触发42.0%→58.0%")
check("D1-page-coverage", set(diagnostics) == set("ABCDEFG") and
      all(set(item) >= {"period", "heroIds", "finding", "crossLink", "chart", "tables", "actions"}
          and item["crossLink"] in diagnostics and len(item["tables"]) >= 2
          and len(item["actions"]) >= 2 and len(item["heroIds"]) == 6
          for item in diagnostics.values()) and
      all(all(any(entry["id"] == metric_id and entry["page"] == page for entry in catalog)
              or (page == "G" and metric_id in (15,29,42,52))
              or (page == "E" and metric_id == 3)
              or (page == "F" and metric_id in (7,8,47))
              or (page == "C" and metric_id == 8)
              for metric_id in item["heroIds"])
          for page,item in diagnostics.items()),
      "七页均有时间、关键指标、证据、跨页路径和模拟行动")
check("D2-chart-contract", all(
    all(len(chart["labels"]) > 0 and
        all(len(series["values"]) == len(chart["labels"])
            for series in chart["series"])
        for chart in [item["chart"], *item.get("extraCharts", [])])
    for item in diagnostics.values()) and
      diagnostics["A"]["chart"]["series"][2]["values"][-1] == 48.0 and
      diagnostics["D"]["chart"]["series"][0]["values"][-1] == 43.4 and
      diagnostics["C"]["chart"]["series"][0]["values"][-1] == 58.0,
      "七页图表序列齐整，故事A/B最后一周与首页一致")
check("D3-story-A-drill", diagnostics["D"]["tables"][1]["rows"][1][1:3] == [450,434] and
      diagnostics["D"]["tables"][1]["rows"][3][1:3] == [6,22] and
      diagnostics["D"]["tables"][1]["rows"][5][1:3] == [256,256] and
      diagnostics["D"]["tables"][0]["rows"][-1][1] == snapshot["effectiveSubscribers"],
      "订阅诊断分组贡献和期末库存与总览闭合")
check("D4-story-B-drill", diagnostics["C"]["tables"][0]["rows"][0][1:4] == [1680,4000,"42.0%"] and
      diagnostics["C"]["tables"][0]["rows"][1][1:4] == [3280,4000,"82.0%"] and
      diagnostics["C"]["tables"][0]["rows"][-1][1:4] == [5800,10000,"58.0%"] and
      diagnostics["A"]["chart"]["series"][2]["values"][7:9] == [56.0,48.0],
      "设备分组解释总体空触发，价值激活同期变化独立展示")
check("D5-business-reconciliation", diagnostics["B"]["chart"]["series"][0]["values"][-1] == snapshot["compositeMAU"] and
      diagnostics["B"]["chart"]["series"][1]["values"][-1] == snapshot["appMAU"] and
      diagnostics["E"]["tables"][0]["rows"][2][-1] == "12,550人" and
      diagnostics["E"]["chart"]["series"][0]["values"][-1] == metrics["m35"]["value"]["monthlySubscriptionPayers"] and
      sum(diagnostics["F"]["chart"]["series"][0]["values"][:2]) == snapshot["boundDevicesCurrent"] and
      diagnostics["G"]["chart"]["series"][0]["values"] == [2,2,2,1] and
      sum(diagnostics["G"]["chart"]["series"][0]["values"]) == metrics["m53"]["value"],
      "活跃、付费、设备、异常下钻与首页指标一致")
months = diagnostics["E"]["tables"][1]["rows"]
check("D7-arppu", len(diagnostics["E"]["extraCharts"]) >= 1 and
      diagnostics["E"]["chart"]["labels"] == diagnostics["E"]["extraCharts"][0]["labels"] and
      all(f"${int(row[2].replace('$','').replace(',','')) / row[1]:.2f}" == row[3] for row in months) and
      diagnostics["E"]["extraCharts"][0]["series"][0]["values"][-1] == metrics["m35"]["value"]["ARPPU"],
      "付费人数与ARPPU使用相同完整月份轴，收入可回算，不使用双Y轴")
activation_30d = metrics["m12"]["value"]["D30"]
check("D9-activation-cohorts", metrics["m12"]["value"]["D7"]["numerator"] ==
      weekly[-1]["registrationCohort"]["firstImage7d"] and
      activation_30d["denominator"] == weekly[6]["registrationCohort"]["registered"] and
      date.fromisoformat(weekly[6]["weekEnd"]) + timedelta(days=30) <=
      date.fromisoformat(snapshot["asOf"]) and
      diagnostics["A"]["tables"][2]["rows"][1][2:4] ==
      [activation_30d["numerator"],activation_30d["denominator"]],
      "A页7日与30日激活使用各自已成熟的注册批次")
cells = metrics["m30"]["value"]["exclusiveCells"]
check("D10-activity-overlap", sum(cells.values()) == snapshot["compositeMAU"] and
      cells["appOnly"] + cells["appContentOnly"] + cells["appPushOnly"] + cells["allThree"] ==
      snapshot["appMAU"] and
      cells["contentOnly"] + cells["appContentOnly"] + cells["contentPushOnly"] + cells["allThree"] ==
      metrics["m30"]["value"]["content"] and
      cells["pushOnly"] + cells["appPushOnly"] + cells["contentPushOnly"] + cells["allThree"] ==
      metrics["m30"]["value"]["pushClicked"],
      "B页七个互斥活跃单元闭合到三来源与复合并集")
touch = metrics["m20"]["value"]
free = metrics["m22"]["value"]
check("D11-conversion-groups", touch["subscriptionPage"]["numerator"] + touch["popup"]["numerator"] ==
      touch["combined"]["numerator"] and
      touch["subscriptionPage"]["denominator"] + touch["popup"]["denominator"] ==
      touch["combined"]["denominator"] and
      max(free[name]["numerator"] for name in ("aiExhausted","storageExhausted","transferExhausted")) <=
      free["anyExhausted"]["numerator"] <=
      sum(free[name]["numerator"] for name in ("aiExhausted","storageExhausted","transferExhausted")) and
      free["anyExhausted"]["numerator"] == snapshot["alerts"]["freeRightsExhausted"],
      "D页触点合计和Free权益并集可回算")
rights_total = 9400 + snapshot["packOnlyUsers"] + 3000
pack = metrics["m36"]["value"]
views = diagnostics["E"]["structureViews"]
check("D12-value-structure", rights_total == snapshot["paidUsersIncludingPackOnly"] and
      9400 + 3000 == snapshot["effectiveSubscribers"] and
      pack["anyPack"]["numerator"] == 3000 + snapshot["packOnlyUsers"] and
      all(sum(value for _,value in view["rows"]) == view["denominator"] for view in views) and
      len(diagnostics["E"]["extraCharts"]) == 3 and
      abs(sum(line["values"][0] for line in diagnostics["E"]["extraCharts"][1]["series"]) - 100) < .1,
      "E页权益三分区、Pack总数、三类构成和100%结构图闭合")
box = diagnostics["A"]["extraCharts"][0]
matrix = diagnostics["E"]["extraCharts"][2]
check("D16-visualization-map", box["kind"] == "boxplot" and
      len(box["series"][0]["values"]) == len(box["labels"]) == 1 and
      box["series"][0]["values"][0] == sorted(box["series"][0]["values"][0]) and
      box["series"][0]["values"][0][2] == metrics["m14"]["value"]["p50Minutes"] and
      box["series"][0]["values"][0][3] <= box["p90"] <= box["series"][0]["values"][0][4] and
      box["p90"] == metrics["m14"]["value"]["p90Minutes"] and
      matrix["kind"] == "heatmap" and len(matrix["labels"]) == 4 and
      len(matrix["dimensions"]) == 2 and
      all(all(abs(actual - expected) < .0001 for actual,expected in zip(
          matrix["series"][0]["values"][index],
          [values["activeRate"]*100,values["subscriptionRate"]*100]))
          for index,values in enumerate(metrics["m39"]["value"].values())),
      "A页箱线分位与P50/P90一致；E页型号热力矩阵回到指标39")
check("D15-channel-denominators", all(
      values["subscriptionNetIncome"] / values["monthlyPayers"] == values["ARPPU"] and
      values["monthlyPayers"] <= values["owners"] and
      all(abs(values[rate_name] * values["owners"] - round(values[rate_name] * values["owners"])) < 1e-6
          for rate_name in ("activation7dRate","activeRate","subscriptionRate"))
      for values in metrics["m40"]["value"].values()) and
      all(abs(values["activeRate"] * values["owners"] - round(values["activeRate"] * values["owners"])) < 1e-6 and
          abs(values["subscriptionRate"] * values["owners"] - round(values["subscriptionRate"] * values["owners"])) < 1e-6
          for values in metrics["m39"]["value"].values()),
      "E页型号和自报渠道的比例有整数人数分子，渠道ARPPU可回算")
device_rows = diagnostics["F"]["tables"][2]["rows"]
rebind = metrics["m51"]["value"]
check("D13-device-structure", sum(row[1] for row in device_rows) == snapshot["boundOwnerAccounts"] and
      sum(row[2] for row in device_rows) == snapshot["boundDevicesCurrent"] and
      sum(row[1] for row in device_rows[1:]) == snapshot["multiDeviceOwners"] and
      metrics["m50"]["value"]["sharedBoundActivated"] +
      metrics["m50"]["value"]["sharedBoundNotActivated"] == snapshot["sharedBoundDevices"] and
      rebind["reboundWithin7d"]["denominator"] ==
      rebind["reboundWithin30d"]["denominator"] == rebind["observedUnboundDevices"] and
      rebind["reboundWithin7d"]["numerator"] <=
      rebind["reboundWithin30d"]["numerator"] <= rebind["observedUnboundDevices"] and
      rebind["unboundDeviceRate"]["numerator"] == rebind["observedUnboundDevices"] and
      rebind["unboundDeviceRate"]["denominator"] == 142000 and
      rebind["unboundEvents"] > rebind["observedUnboundDevices"],
      "F页设备分层、共享子集和回绑率去重分母正确")
quality_history = metric_trends["m54"]
quality_baseline = next(row for table in diagnostics["G"]["tables"]
                        for row in table["rows"] if row[0] == "埋点丢失率")
check("D14-quality-trend", quality_baseline[1] ==
      f'{quality_history["labels"][0]} {quality_history["points"][0]["value"] * 100:.1f}%' and
      quality_history["labels"][0] ==
      (date.fromisoformat(snapshot["asOf"]) - timedelta(days=len(quality_history["labels"])-1)).strftime("%-m/%-d") and
      abs(diagnostics["G"]["extraCharts"][0]["series"][0]["values"][-1] -
      metrics["m54"]["value"]["eventLoss"]["value"] * 100) < .0001 and
      sum(diagnostics["G"]["chart"]["series"][0]["values"]) == metrics["m53"]["value"] and
      snapshot["quality"]["eventLossNumerator"] / snapshot["quality"]["eventExpected"] <=
      snapshot["quality"]["thresholds"]["eventLossMax"] and
      snapshot["quality"]["mappedRecords"] / snapshot["quality"]["mappingRecords"] >=
      snapshot["quality"]["thresholds"]["idMappingMin"] and
      snapshot["quality"]["status"] == "正常",
      "G页质量趋势末值与快照一致，演示正常阈值成立，异常事件不混入人群池")
check("D8-observation-window", date.fromisoformat(weekly[-1]["weekEnd"]) + timedelta(days=7) <=
      date.fromisoformat(snapshot["asOf"]) <= date.today() and
      all(item["period"].find("2026-09-27") == -1 for item in diagnostics.values()),
      "最新注册周有完整7日观察窗，快照未写到未来")
check("D6-actions", len({action["id"] for item in diagnostics.values() for action in item["actions"]}) ==
      sum(len(item["actions"]) for item in diagnostics.values()) and
      all(action["status"] == "待研判" and "演示样本" in action["trigger"] and
          action["id"] in action["object"] and action["updatedAt"] and
          any(metric["id"] == action["evidenceMetric"] and metric["page"] == page
              for metric in catalog)
          for page, item in diagnostics.items() for action in item["actions"]),
      "模拟行动ID唯一，对象、触发、状态、更新时间齐全，关联到本页有效指标依据")
device_samples = entity_samples["C"]
incident_samples = entity_samples["G"]
incident_rows = diagnostics["G"]["tables"][0]["rows"]
all_samples = device_samples + incident_samples
check("D17-entity-samples", len(device_samples) == 4 and len(incident_samples) == len(incident_rows) == 7 and
      next(item for item in incident_samples if item["id"] == "EX-06")["evidence"] == {"page":"C", "metricId":44} and
      len({item["id"] for item in all_samples}) == len(all_samples) and
      all(item["observedAt"][:10] <= snapshot["asOf"] and item["review"] and
          any(row["id"] == item["evidence"]["metricId"] and row["page"] == item["evidence"]["page"]
              for row in catalog) for item in all_samples) and
      all(all(key in slices and value in slices[key] if key != "week" else
              value in {str(row["week"]) for row in weekly}
              for key,value in item["dimensions"].items()) for item in device_samples) and
      all([item[key] for key in ("id","domain","signal","status")] == row
          for item,row in zip(incident_samples,incident_rows)) and
      "不参与总体指标计算" in entity_samples["note"],
      "C页设备和G页事件样本可追溯、时间有效，并与总体计算隔离")
check("D18-key-metric-trends", all(
      len(metric_trends[f"m{identifier:02d}"]["points"]) == len(weekly) and
      metric_trends[f"m{identifier:02d}"]["labels"] == [
          (date.fromisoformat(snapshot["asOf"])-timedelta(days=7*(len(weekly)-1-i))).strftime("%-m/%-d")
          for i in range(len(weekly))] and
      metric_trends[f"m{identifier:02d}"]["points"][-1]["kind"] == metrics[f"m{identifier:02d}"]["kind"] and
      (metric_trends[f"m{identifier:02d}"]["points"][-1]["value"] == metrics[f"m{identifier:02d}"]["value"]
       if identifier in (15, 34, 52) else
       metric_trends[f"m{identifier:02d}"]["points"][-1]["numerator"] == metrics[f"m{identifier:02d}"]["numerator"] and
       metric_trends[f"m{identifier:02d}"]["points"][-1]["denominator"] == metrics[f"m{identifier:02d}"]["denominator"])
      for identifier in (15, 27, 34, 52)),
      "四项新增关键趋势有12期，末点与底表当前值及分子分母一致")
# Device-level facts reconcile current and all declared historical backlog snapshots.
def device_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
binding_asof = device_time(binding_devices["asOf"])
binding_rows = binding_devices["records"]
def device_pool(at):
    return [r for r in binding_rows if device_time(r["boundAt"]) < at-timedelta(hours=72) and
            (r["firstImageAt"] is None or device_time(r["firstImageAt"]) > at)]
check("D19-binding-device-ledger", binding_devices["thresholdHours"] == 72 and
      binding_asof.date().isoformat() == snapshot["asOf"] and
      len({r["id"] for r in binding_rows}) == len(binding_rows) and
      all(r["productLine"] == ("Hunting" if r["deviceModel"] == "Hunt Pro" else "Bird") and
          r["country"] in slices["country"] and r["deviceModel"] in slices["deviceModel"] and
          r["deviceStatus"] == "Effective" and r["appVersion"] and r["handlingStatus"] and r["owner"] and
          device_time(r["boundAt"]) <= binding_asof and
          (r["firstImageAt"] is None or device_time(r["boundAt"]) <= device_time(r["firstImageAt"]) <= binding_asof)
          for r in binding_rows) and
      len(device_pool(binding_asof)) == metrics["m15"]["value"] == 128 and
      [len(device_pool(device_time(p["at"]))) for p in binding_devices["snapshots"]] ==
      [p["count"] for p in binding_devices["snapshots"]] == [p["value"] for p in metric_trends["m15"]["points"]] and
      [f"{device_time(p['at']).month}/{device_time(p['at']).day}" for p in binding_devices["snapshots"]] == metric_trends["m15"]["labels"],
      "128台当前候选设备及12期总体数量由同一绑定/首图台账回算；型号归属、时间、唯一性和源字段有效")
# Same complete, disjoint behaviour-age population for active and unused devices.
activity_groups = {(country, model, firmware) for country in filter_policy['controls']['country']['options']
                   for model in filter_policy['controls']['deviceModel']['options']
                   for firmware in (['2.8', 'Other'] if model == 'K6' else ['Other'])}
def valid_activity_groups(rows):
    return (len(rows) == len(activity_groups) and
            {(r['country'], r['deviceModel'], r['firmware']) for r in rows} == activity_groups and
            all(r['productLine'] == ('Hunting' if r['deviceModel'] == 'Hunt Pro' else 'Bird') and
                r['deviceStatus'] == 'Effective' for r in rows))
activity_ok = (device_activity['version'] == 'synthetic-device-age-v1' and
               device_activity['activeWindowDays'] == 30 and
               device_activity['ageBands'] == [[0,1],[1,7],[7,21],[21,30],[30,None]] and
               len(device_activity['snapshots']) == 12)
for i, point in enumerate(device_activity['snapshots']):
    bands = [sum(row['counts'][j] for row in point['records']) for j in range(5)]
    daily, weekly_active, active21, active30 = [sum(bands[:j]) for j in [1,2,3,4]]
    total = sum(bands)
    activity_ok &= (valid_activity_groups(point['records']) and
                    all(len(row['counts']) == 5 and all(type(n) is int and n >= 0 for n in row['counts'])
                        for row in point['records']) and
                    device_time(point['at'])-device_time(point['observedFrom']) == timedelta(days=30) and
                    total == point['eligibleDevices'] == metric_trends['m41']['points'][i]['denominator'] and
                    active30 == metric_trends['m41']['points'][i]['numerator'] and
                    bands[3]+bands[4] == metric_trends['m44']['points'][i]['numerator'] and
                    0 <= daily <= weekly_active <= active21 <= active30 <= total and
                    active30+bands[4] == total)
activity_ok &= (device_activity['snapshots'][-1]['at'] == device_activity['asOf'] and
                device_activity['asOf'][:10] == snapshot['asOf'] and
                [daily,weekly_active,active30,total,bands[3]+bands[4],bands[4]] ==
                [16200,46500,85278,139800,60000,54522] and
                metrics['m44']['numerator'] == 60000)
check('D20-device-behaviour-windows', activity_ok,
      '近24小时/7/30天活跃是子集，21/30天未使用单调，同群30天互补；12期同源分组和当前61%闭合')
returns_ok = {p['thresholdDays'] for p in device_activity['returnCohorts']} == {21,30}
for cohort in device_activity['returnCohorts']:
    returns_ok &= (cohort['windowDays'] == 7 and valid_activity_groups(cohort['records']) and
                   device_time(cohort['observedThrough'])-device_time(cohort['entryAt']) == timedelta(days=7) and
                   device_time(cohort['observedThrough']) <= device_time(device_activity['asOf']) and
                   all(type(r['eligible']) is int and type(r['returned']) is int and
                       0 <= r['returned'] <= r['eligible'] for r in cohort['records']) and
                   sum(r['eligible'] for r in cohort['records']) == cohort['eligibleDevices'] and
                   sum(r['returned'] for r in cohort['records']) == cohort['returnedDevices'])
check('D21-independent-device-return', returns_ok,
      '设备回流有独立历史入组、完整7天观察日期及同范围分母，不用当前未使用池计算')

# Canonical full-month source; chart arrays and the table must use exactly these rows.
payment = diagnostics['E']['paymentMonths']
months = [f'{year}-{month:02d}' for year, month in [(2025,9),(2025,10),(2025,11),(2025,12),*[(2026,m) for m in range(1,9)]]]
payment_rows = payment['rows']
payment_arppu = [r['netIncome']/r['payers'] for r in payment_rows]
payment_table = next(t for t in diagnostics['E']['tables'] if t['title']=='完整月付款与人均收入')
check('D22-complete-payment-months', payment['version']=='synthetic-payment-months-v1' and
      payment['asOf']==snapshot['asOf'] and [r['month'] for r in payment_rows]==months and
      all(type(r['payers']) is int and r['payers']>0 and type(r['netIncome']) is int and r['netIncome']>=0 and
          r['provenance']==('constructed-simulation' if i<9 else 'existing-demo-summary') for i,r in enumerate(payment_rows)) and
      [[r['payers'],r['netIncome']] for r in payment_rows[-3:]]==[[9600,48000],[9800,49980],[10000,52000]] and
      diagnostics['E']['chart']['labels']==diagnostics['E']['extraCharts'][0]['labels']==months and
      diagnostics['E']['chart']['series'][0]['values']==[r['payers'] for r in payment_rows] and
      diagnostics['E']['extraCharts'][0]['series'][0]['values']==payment_arppu and
      payment_table['rows']==[[r['month'],r['payers'],f"${r['netIncome']:,}",f"${r['netIncome']/r['payers']:.2f}"] for r in payment_rows] and
      [payment_rows[-1]['payers'],payment_rows[-1]['netIncome'],payment_arppu[-1]]==
      [metrics['m35']['value']['monthlySubscriptionPayers'],metrics['m35']['value']['subscriptionNetIncome'],metrics['m35']['value']['ARPPU']],
      '12个连续完整自然月、合成来源及原6–8月锚点一致；人数、净收入、ARPPU及两图/完整表闭合')

duration_ok = onboarding['version']=='synthetic-onboarding-duration-v1' and onboarding['status']=='SYNTHETIC_DEMO' and onboarding['asOf']==snapshot['asOf']
for label,mid in [('binding',11),('activation',13)]:
    cohorts=onboarding[label]['cohorts']
    duration_ok &= len(cohorts)==12
    for c,w in zip(cohorts,weekly):
        n=sum(count for r in c['records'] for seconds,count in r['durationCounts'])
        d=sum(r['eligible'] for r in c['records'])
        expected=(w['bindingAttempts']['successful'],w['bindingAttempts']['total']) if mid==11 else (w['registrationCohort']['valueActivated7dBird'],w['registrationCohort']['birdEligible'])
        duration_ok &= ((n,d)==expected and c['week']==w['week'] and c['cohortEnd']==w['weekEnd'] and len(c['records'])==24 and
            date.fromisoformat(c['cohortEnd'])-date.fromisoformat(c['cohortStart'])==timedelta(days=6) and
            date.fromisoformat(c['cohortEnd'])+timedelta(days=2 if mid==11 else 8)<=date.fromisoformat(c['observedThrough'])<=date.fromisoformat(onboarding['asOf']))
        for r in c['records']:
            success=sum(count for seconds,count in r['durationCounts'])
            excluded=sum(r['failureCounts'].values()) if mid==11 else r['notActivatedWithin7d']
            duration_ok &= (success+excluded==r['eligible'] and all(type(seconds) is int and type(count) is int and
                0<=seconds<=(86400 if mid==11 else 604799) and count>=0 for seconds,count in r['durationCounts']))
check('D23-onboarding-frequency-source',duration_ok,'576个互斥合成分组；成功频数与失败/未达成闭合、24个原周度总计和完整观察窗保留')
historical_contracts={item['id']:item for item in contract if item['id'] in (43,51)}
check('D24-historical-device-boundaries',
      'deviceStatus' in policy_metrics[43]['businessDimensions'] and 'deviceStatus' in policy_metrics[43]['demonstrableDimensions'] and
      'deviceStatus' in policy_metrics[51]['businessDimensions'] and 'deviceStatus' in policy_metrics[51]['demonstrableDimensions'] and
      '自然日完整观察' in historical_contracts[43]['window'] and
      '未成熟不报最终率' in historical_contracts[51]['window'] and diagnostics['F']['unbindingFacts']['status']=='approved-synthetic',
      '设备留存按激活入组、解绑按月初冻结状态；后续停用或解绑不剔除历史分母')

retention = metric_trends['m24']
retention_ok = (retention['status']=='approved-synthetic' and retention['classification']=='entirely_synthetic' and
                retention['asOf']==snapshot['asOf'] and retention['version']=='synthetic-monthly-retention-v1' and
                len(retention['points'])==12 and retention['labels']==months)
previous_cells = None
for i,row in enumerate(retention['points']):
    year,month = map(int,months[i].split('-'))
    start = date(year,month,1)
    base_month = (start-timedelta(days=1)).strftime('%Y-%m')
    next_month = date(year+int(month==12),month%12+1,1)
    cells = {(r['country'],r['appPlatform']):r for r in row['records']}
    retention_ok &= (row['observedMonth']==months[i] and row['baseMonth']==base_month and
        row['observedThrough']==(next_month-timedelta(days=1)).isoformat() and row['observedThrough']<snapshot['asOf'] and
        len(row['records'])==len(cells)==8 and set(cells)=={(c,p) for c in ('US','UK','DE','Other') for p in ('iOS','Android')} and
        all(type(r[k]) is int and r[k]>=0 for r in row['records'] for k in ('baseActive','retained','observedActive')) and
        all(r['retained']<=min(r['baseActive'],r['observedActive']) for r in row['records']) and
        row['numerator']==sum(r['retained'] for r in row['records']) and
        row['denominator']==sum(r['baseActive'] for r in row['records']) and
        row['activeObserved']==sum(r['observedActive'] for r in row['records']) and
        row['denominator']>0 and abs(row['value']-row['numerator']/row['denominator'])<1e-12)
    if previous_cells:
        retention_ok &= all(previous_cells[k]['observedActive']==r['baseActive'] for k,r in cells.items())
    previous_cells = cells
retention_ok &= ([(r['numerator'],r['denominator']) for r in retention['points'][-2:]]==[(48960,68000),(54000,70000)] and
                 metrics['m24']['numerator']==54000 and metrics['m24']['denominator']==70000 and
                 metrics['m24']['value']==54000/70000)
check('D25-monthly-retention-cohorts',retention_ok,
      '12个完整自然月、96个互斥国家×基期App平台分组、两期人数与相邻月接续闭合；不是逐账号事件链证明')

device_retention=load('device-retention-facts.json')
cohorts=device_retention['cohorts']
as_of=date.fromisoformat(snapshot['asOf'])
last_end=as_of-timedelta(days=as_of.weekday()+1)
cohort_ok=device_retention['status']=='approved-synthetic' and device_retention['classification']=='entirely_synthetic' and device_retention['asOf']==snapshot['asOf'] and len(cohorts)==12
for i,c in enumerate(cohorts):
    end=last_end-timedelta(weeks=11-i)
    cohort_ok &= (c['end']==end.isoformat() and c['start']==c['id']==(end-timedelta(days=6)).isoformat() and len(c['records'])==32 and
                  sum(r['activated'] for r in c['records'])==c['activated'] and
                  len({(r['country'],r['deviceModel'],r['salesChannel']) for r in c['records']})==32)
    for key,days in [('D7',7),('D30',30)]:
        cutoff=end+timedelta(days=days+1)
        cohort_ok &= c['observationEndExclusive'][key]==cutoff.isoformat() and c['mature'][key]==(as_of>=cutoff)
        for r in c['records']:
            cohort_ok &= (r['entryDeviceStatus']=='Effective' and r['productLine']==('Hunting' if r['deviceModel']=='Hunt Pro' else 'Bird') and
                          sum(o['count'] for o in r['outcomeCounts'])==r['activated'] and
                          all(type(o['count']) is int and o['count']>0 and (type(o[key]) is bool if c['mature'][key] else o[key] is None) for o in r['outcomeCounts']))
anchor_cohort=next(c for c in cohorts if c['id']==device_retention['defaultCohort'])
cohort_ok &= anchor_cohort['id']=='2026-08-17' and all(
    metrics['m43']['value'][key]['numerator']==sum(o['count'] for r in anchor_cohort['records'] for o in r['outcomeCounts'] if o[key]) and
    metrics['m43']['value'][key]['denominator']==anchor_cohort['activated'] for key in ['D7','D30'])
check('D26-device-retention-cohorts',cohort_ok,'12个激活周、384个同源互斥分组；UTC日界、成熟性与两项留存计数闭合，后续停用不剔除')

renewal_ok = monthly_renewal['status']=='APPROVED_SYNTHETIC' and monthly_renewal['classification']=='entirely_synthetic' and len(monthly_renewal['months'])==12
for m in monthly_renewal['months']:
    outcomes=[o for r in m['records'] for o in r['outcomeCounts']]
    renewal_ok &= (len(m['records'])==240 and sum(o['count'] for o in outcomes)==m['opening'] and
                   sum(o['count'] for o in outcomes if o['due'])==m['due'] and
                   sum(o['count'] for o in outcomes if o['renewed'])==m['renewed'] and
                   sum(o['count'] for o in outcomes if o['lossReason'] is not None)==m['lostDuring'] and
                   sum(o['count'] for o in outcomes if o['cancelled'])==m['cancelled'] and
                   date.fromisoformat(m['renewalObservationEndExclusive'])-date.fromisoformat(m['endExclusive'])==timedelta(days=7) and
                   all(not o['renewed'] or o['due'] for o in outcomes))
check('D27-monthly-renewal',renewal_ok,'12个到期月、2880个互斥合成频数单元；三项人数及7天演示观察窗闭合，旧周度不是月度环比')
views=diagnostics['E']['structureViews']
check('D28-structure-source',len(views)==3 and all(sum(r[1] for r in v['rows'])==v['denominator'] for v in views) and
      views[0]['denominator']==views[1]['denominator']==metrics['m07']['value']['registered'] and views[2]['denominator']==metrics['m08']['value']['boundCurrent'],
      '国家与App按全部注册用户、型号按当前绑定设备，人数与各自分母闭合；没有12个月历史或交叉切片')

active_windows=load('activity-window-facts.json')
active_ok=active_windows['version']=='synthetic-active-windows-v1' and active_windows['status']=='approved-synthetic' and len(active_windows['rows'])==84
for i,row in enumerate(active_windows['rows']):
    active_ok &= (datetime.fromisoformat(row['at'])==datetime.fromisoformat(active_windows['asOf'])-timedelta(days=83-i) and len(row['records'])==8 and
                  len({(r['country'],r['appPlatform']) for r in row['records']})==8)
    for r in row['records']:
        counts=[]
        for field in ['compositeAge','appAge']:
            counts.append([sum(o['count'] for o in r['outcomes'] if o[field] is not None and o[field]<=bound) for bound in range(3)])
        active_ok &= all(a<=b for a,b in zip(counts[1],counts[0])) and all(v[0]<=v[1]<=v[2] for v in counts)
last=active_windows['rows'][-1]
for bound,key in enumerate(['DAU','WAU','MAU']):
    active_ok &= metrics['m25']['value'][key]==sum(o['count'] for r in last['records'] for o in r['outcomes'] if o['compositeAge']<=bound)
    active_ok &= metrics['m25']['value']['app'+key]==sum(o['count'] for r in last['records'] for o in r['outcomes'] if o['appAge'] is not None and o['appAge']<=bound)
check('D29-active-window-frequencies',active_ok,'84个每日UTC零时快照、672组；三窗口嵌套，App子集与六项当前人数闭合；不是自然周／月')
active_policies=[r for r in filter_policy['metrics'] if r['id'] in [4,25,30]]
check('D30-active-window-applicability',len(active_policies)==3 and all(set(r['demonstrableDimensions'])=={'country','appPlatform'} and {'deviceModel','productLine'}<=set(r['unavailableDimensions']) for r in active_policies),
      '三项仅国家×App同源可算；型号／产品线保留业务适用性、缺归属待补，不独立乘比例')

# Approved #54 daily count source: independent pools, real UTC windows and original seven count anchors.
q = diagnostics['G']['qualityFacts']
qd = q['days']
check('D31-quality-source', q['status'] == 'approved-synthetic' and q['classification'] == 'entirely_synthetic' and
      len(qd) == 30 and all(len(d['eventGroups']) == 24 and len(d['mappingGroups']) == 8 and
      len({(r['country'], r['appPlatform'], r['eventType']) for r in d['eventGroups']}) == 24 and
      len({(r['country'], r['appPlatform']) for r in d['mappingGroups']}) == 8 and
      all(type(r['expected']) is int and 0 <= r['ingested'] <= r['expected'] and type(r['expectedReliable']) is bool for r in d['eventGroups']) and
      all(type(r['records']) is int and 0 <= r['mapped'] <= r['records'] for r in d['mappingGroups']) and
      d['endExclusive'].endswith('T00:00:00Z') and
      date.fromisoformat(d['endExclusive'][:10]) - date.fromisoformat(d['startInclusive'][:10]) == timedelta(days=1) and
      date.fromisoformat(d['endExclusive'][:10]) == date.fromisoformat(q['asOf'][:10]) - timedelta(days=29-i)
      for i,d in enumerate(qd)), '30完整UTC日、720采集组与240独立关联组；日窗连续、分组唯一、计数有效')
check('D32-quality-anchors', [sum(r['expected']-r['ingested'] for r in d['eventGroups']) for d in qd[-7:]] ==
      [p['numerator'] for p in quality_history['points']] and
      sum(r['mapped'] for r in qd[-1]['mappingGroups']) == 9650 and
      sum(r['records'] for r in qd[-1]['mappingGroups']) == 10000 and
      sum(r['expected']-r['ingested'] for r in qd[-1]['eventGroups'] if r['appPlatform']=='Android') == 177 and
      sum(r['mapped'] for r in qd[-1]['mappingGroups'] if r['appPlatform']=='Android') == 4540 and
      any(not r['expectedReliable'] for d in qd for r in d['eventGroups']),
      '保留末7日丢失计数及220/10000、9650/10000；Android新合成177/4800、4540/4800，保留无可靠预期样例')

try:
    unbinding_audit = runpy.run_path(str(ROOT / 'scripts/verify_unbinding_source.py'))['summary']
    unbinding_ok = unbinding_audit['status']=='PASS' and unbinding_audit['cohortScopes']==2736
except (AssertionError, KeyError, TypeError, ValueError):
    unbinding_ok = False
check('D33-monthly-unbinding-ledger', unbinding_ok,
      '12月、2625台合成设备与5555条关系事件；月初有效归属、重复解绑、观察窗口、2736范围与总体计数独立闭合')

try:
    risk_audit = runpy.run_path(str(ROOT / 'scripts/verify_risk_source.py'))['summary']
    risk_ok = risk_audit['status']=='PASS' and risk_audit['current']==168 and risk_audit['freeRisk']==48
except (AssertionError, KeyError, TypeError, ValueError):
    risk_ok = False
check('D34-risk-account-evidence', risk_ok,
      '216个合成账号、112日活跃和12期信号；2592份账号快照及900组筛选独立验算，108＋78－18＝168，Free48人')

try:
    approved = runpy.run_path(str(ROOT / 'scripts/verify_approved_cohorts.py'))['summary']
    approved_ok = approved['status']=='PASS' and approved['featureScopeDays']==1260 and approved['retentionScopeCohorts']==360 and approved['registrationScopeCohorts']==540
except (AssertionError, KeyError, TypeError, ValueError):
    approved_ok = False
check('D35-approved-feature-user-registration-cohorts', approved_ok,
      '已确认功能672组、新客861组与注册576组；1260／360／540范围周期独立闭合，旧锚点与完整观察规则保留')

try:
    activation_source = runpy.run_path(str(ROOT / 'scripts/verify_activation_devices_source.py'))['summary']
    activation_source_ok = activation_source['status']=='PASS' and activation_source['records']==25160 and activation_source['current']==2450
except (AssertionError, KeyError, TypeError, ValueError):
    activation_source_ok = False
check('D36-first-content-device-ledger', activation_source_ok,
      '独立首次内容台账25,160台、84日、12完整周同源闭合；默认9/14—9/20为2,450台，保留#43来源')

try:
    opening_source = runpy.run_path(str(ROOT / 'scripts/verify_trial_opening_source.py'))['summary']
    opening_source_ok = opening_source['status']=='PASS' and opening_source['denominatorGroups']==96 and opening_source['openingCells']==1719
except (AssertionError, KeyError, TypeError, ValueError):
    opening_source_ok = False
check('D37-trial-opening-registration-population', opening_source_ok,
      '12个成熟注册批次、96组分母与#9一致；1,719个开启构成单元互斥闭合，方案属性不构造未开启者分母')

report = {"passed": sum(c["passed"] for c in checks), "total": len(checks), "checks": checks}
(DATA / "validation-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for c in checks:
    print(("PASS" if c["passed"] else "FAIL"), c["rule"], c["detail"])
raise SystemExit(0 if report["passed"] == report["total"] else 1)
