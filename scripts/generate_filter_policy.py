"""Build the dashboard filter policy from metric contracts and business rules.

The contract's dimensions describe today's demonstrable calculations. This file
records business applicability separately, so a missing synthetic slice cannot
silently remove a valid filter from the product.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
contract = json.loads((DATA / "filter-contract.json").read_text())

# These joins are meaningful to the business, but the current aggregate workbook
# does not have the linked records required to calculate them.
BUSINESS_ADD = {
    2: {"deviceModel"}, 3: {"deviceModel", "billingCycle"},
    5: {"deviceModel", "plan"}, 6: {"deviceModel"},
    14: {"country", "productLine", "deviceModel"},
    18: {"subscriptionPlatform", "billingCycle"},
    20: {"country", "productLine"},
    21: {"productLine", "deviceModel", "billingCycle"},
    23: {"deviceModel", "billingCycle"},
    26: {"country", "appPlatform"},
    31: {"country", "appPlatform"},
    33: {"country", "appPlatform", "productLine", "subscriptionPlatform", "plan", "billingCycle"},
    34: {"deviceModel"}, 35: {"deviceModel", "billingCycle"},
    38: {"country", "appPlatform", "productLine", "deviceModel"},
    39: {"country"}, 40: {"country", "productLine"},
    45: {"country"}, 46: {"country"}, 47: {"country"},
    54: {"country", "appPlatform", "productLine", "deviceModel"},
}

controls = {
    "country": {"label": "国家/市场", "scope": "page", "pages": "ABCDEFG", "options": ["US", "UK", "DE", "Other"]},
    "productLine": {"label": "产品线", "scope": "page", "pages": "ABCDEFG", "options": ["Bird", "Hunting"]},
    "deviceModel": {"label": "设备型号", "scope": "module", "pages": "ABCDEFG", "options": ["K6", "Bird Lite", "Bird Pro", "Hunt Pro"]},
    "appPlatform": {"label": "App平台", "scope": "module", "pages": "ABDEF", "options": ["iOS", "Android"]},
    "deviceStatus": {"label": "设备状态", "scope": "module", "pages": "ACFG", "options": ["Effective", "Inactive"]},
    "salesChannel": {"label": "自报销售渠道", "scope": "module", "pages": "ACE", "options": ["Amazon", "Shopify"]},
    "subscriptionPlatform": {"label": "订阅平台", "scope": "module", "pages": "DE", "options": ["App Store", "Google Play", "Web"]},
    "plan": {"label": "套餐", "scope": "module", "pages": "DE", "optionsByProduct": {"Bird": ["Free", "Plus", "Pro"], "Hunting": ["Starter", "Plus", "Pro"]}},
    "billingCycle": {"label": "计费周期", "scope": "module", "pages": "DE", "options": ["monthly", "annual"]},
    "firmware": {"label": "固件版本", "scope": "module", "pages": "CG", "options": ["2.8", "Other"]},
    "anomalyType": {"label": "异常类型", "scope": "module", "pages": "G", "options": ["Business", "Device", "Quality"]},
    "functionType": {"label": "查看功能", "scope": "view", "pages": "BC", "optionsByPage": {"B": ["Live", "Playback", "Recognition"], "C": ["Upload", "Live", "Push"]}},
    "season": {"label": "未使用判定规则", "scope": "rule", "pages": "BC", "options": ["Migration", "Other"]},
    "week": {"label": "成熟统计周", "scope": "period", "pages": "ACD", "options": [str(i) for i in range(1, 13)]},
}

metric_policy = []
for item in contract:
    mid = item["id"]
    demonstrable = set(item["dimensions"]) - {"userType"}
    if mid in (45, 46):
        demonstrable.discard("country")
    if mid == 39:
        demonstrable.add("country")
    if mid == 21:
        demonstrable.add("productLine")
    business = demonstrable | BUSINESS_ADD.get(mid, set())
    if mid == 29:
        business.add("season")
    if mid == 44:
        business.add("season")
    if mid in (27, 46):
        business.add("functionType")
    if mid in (18, 23, 32, 33, 34, 35):
        business.add("billingCycle")
    business.discard("userType")
    metric_policy.append({
        "id": mid,
        "page": item["page"],
        "entity": item["entity"],
        "window": item["window"],
        "businessDimensions": sorted(business),
        "demonstrableDimensions": sorted(demonstrable),
        "unavailableDimensions": sorted(business - demonstrable),
    })

assert len(metric_policy) == 53
assert {item["id"] for item in metric_policy} == set(range(2, 55))
policy = {
    "version": "business-2026-09-28-v1",
    "population": {
        "registeredAccounts": "正式用户＝非测试注册账号；包含处于试用中的正式账号",
        "deviceDefault": "设备类指标默认使用有效设备；用户类指标不套用设备状态",
    },
    "coverage": {"asOf": "2026-09-24", "firstCompleteWeek": "2026-06-28", "lastCompleteWeek": "2026-09-13"},
    "controls": controls,
    "metrics": metric_policy,
}
(DATA / "filter-policy.json").write_text(json.dumps(policy, ensure_ascii=False, indent=2) + "\n")
print(f"PASS {len(metric_policy)} metric filter policies with business/data separation")
