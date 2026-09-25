"""Dashboard data contract checks, independent from the renderer."""
from __future__ import annotations

import json
from datetime import date, timedelta
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
check("F2-synthetic-slices", all(
      abs(sum(option["denominatorShare"] for option in values.values()) - 1) < 1e-7 and
      abs(sum(option["numeratorShare"] for option in values.values()) - 1) < 1e-6 and
      all(0 < option["denominatorShare"] <= 1 and 0 < option["numeratorShare"] <= 1
          for option in values.values()) for values in slices.values()),
      "各模拟维度的分母与分子分片独立闭合为100%")
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
      metrics["m23"]["numerator"] == weekly[-1]["renewal"]["successful"],
      "全部率可回算；首页关键率与最新完整周一致")
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
      all(int(row[2].replace("$","").replace(",","")) / row[1] ==
          float(row[3].replace("$","")) for row in months) and
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
check("D14-quality-trend", abs(diagnostics["G"]["extraCharts"][0]["series"][0]["values"][-1] -
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
          action["id"] in action["object"] and action["updatedAt"]
          for item in diagnostics.values() for action in item["actions"]),
      "模拟行动ID唯一，对象、触发、状态、更新时间齐全")
report = {"passed": sum(c["passed"] for c in checks), "total": len(checks), "checks": checks}
(DATA / "validation-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for c in checks:
    print(("PASS" if c["passed"] else "FAIL"), c["rule"], c["detail"])
raise SystemExit(0 if report["passed"] == report["total"] else 1)
