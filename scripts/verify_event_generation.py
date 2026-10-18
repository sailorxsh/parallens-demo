"""Rebuild event fixtures in a temporary checkout, preserving reviewed source files."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTOTYPE = ROOT / "prototype"
scratch = Path(tempfile.mkdtemp(prefix="parallens-event-generation-"))
(scratch / "prototype" / "scripts").mkdir(parents=True)
(scratch / "revised").mkdir()
shutil.copytree(PROTOTYPE / "data", scratch / "prototype" / "data")
book = "用户与设备经营看板-修订数据底表.xlsx"
shutil.copy2(ROOT / "revised" / book, scratch / "revised" / book)
for name in ["generate_data.py", "generate_filter_policy.py", "generate_device_activity.py", "generate_metric_trends.py", "generate_payment_months.py", "generate_onboarding_duration.py", "generate_monthly_retention.py", "generate_device_retention.py", "generate_monthly_renewal.py", "generate_activity_windows.py", "generate_status_history.py"]:
    shutil.copy2(PROTOTYPE / "scripts" / name, scratch / "prototype" / "scripts" / name)

read = lambda folder, name: json.loads((folder / name).read_text())
data = scratch / "prototype" / "data"
expected_weekly = read(PROTOTYPE / "data", "weekly.json")
expected_policy = next(item for item in read(PROTOTYPE / "data", "filter-policy.json")["metrics"] if item["id"] == 42)
protected = {name: (data / name).read_bytes() for name in ["metric-catalog.json", "filter-contract.json", "diagnostics.json"]}
subprocess.run([sys.executable, str(scratch / "prototype" / "scripts" / "generate_data.py")], check=True, capture_output=True)
assert read(data, "weekly.json") == expected_weekly, "Rebuilding lost reviewed weekly facts or changed their totals"
for name, content in protected.items():
    assert (data / name).read_bytes() == content, f"Rebuilding changed reviewed {name}"
subprocess.run([sys.executable, str(scratch / "prototype" / "scripts" / "generate_filter_policy.py")], check=True, capture_output=True)
subprocess.run([sys.executable, str(scratch / "prototype" / "scripts" / "generate_device_activity.py")], check=True, capture_output=True)
subprocess.run([sys.executable, str(scratch / "prototype" / "scripts" / "generate_metric_trends.py")], check=True, capture_output=True)
subprocess.run([sys.executable, str(scratch / "prototype" / "scripts" / "generate_payment_months.py")], check=True, capture_output=True)
assert read(data, "diagnostics.json") == read(PROTOTYPE / "data", "diagnostics.json"), "Monthly source/presentation do not rebuild deterministically"
subprocess.run([sys.executable, str(scratch / "prototype" / "scripts" / "generate_onboarding_duration.py")], check=True, capture_output=True)
assert read(data, "onboarding-duration-facts.json") == read(PROTOTYPE / "data", "onboarding-duration-facts.json"), "Onboarding frequencies do not rebuild deterministically"
subprocess.run([sys.executable, str(scratch / 'prototype' / 'scripts' / 'generate_device_retention.py')], check=True, capture_output=True)
assert read(data, 'device-retention-facts.json') == read(PROTOTYPE / 'data', 'device-retention-facts.json'), 'Device retention frequencies do not rebuild deterministically'
subprocess.run([sys.executable, str(scratch / 'prototype' / 'scripts' / 'generate_monthly_renewal.py')], check=True, capture_output=True)
assert read(data, 'monthly-renewal-facts.json') == read(PROTOTYPE / 'data', 'monthly-renewal-facts.json'), 'Monthly renewal frequencies do not rebuild deterministically'
subprocess.run([sys.executable, str(scratch / 'prototype' / 'scripts' / 'generate_activity_windows.py')], check=True, capture_output=True)
assert read(data, 'activity-window-facts.json') == read(PROTOTYPE / 'data', 'activity-window-facts.json'), 'Daily active-window source does not rebuild deterministically'
subprocess.run([sys.executable, str(scratch / 'prototype' / 'scripts' / 'generate_status_history.py')], check=True, capture_output=True)
assert read(data, 'subscription-flow.json') == read(PROTOTYPE / 'data', 'subscription-flow.json'), 'Status snapshots or existing flow data changed on rebuild'
for key in ['m24', 'm41', 'm44']:
    assert read(data, 'metric-trends.json')[key] == read(PROTOTYPE / 'data', 'metric-trends.json')[key], f"Rebuilding changed approved device window history {key}"
assert read(data, 'device-activity-facts.json') == read(PROTOTYPE / 'data', 'device-activity-facts.json'), 'Device age source does not rebuild deterministically'
actual_policy = next(item for item in read(data, "filter-policy.json")["metrics"] if item["id"] == 42)
assert actual_policy == expected_policy, "Rebuilding changed event filter capability or business applicability"
generated_files = ["metric-catalog.json", "weekly.json", "snapshot.json", "metric-values.json", "page-data.json",
                   "stories.json", "diagnostics.json", "filter-contract.json", "filter-slices.json", "filter-policy.json"]
for name in generated_files:
    assert read(data, name) == read(PROTOTYPE / "data", name), f"Generated {name} differs from the reviewed dataset"
for week in read(data, "weekly.json"):
    events = week["deviceEventsBird"]
    assert sum(row["empty"] for row in events["records"]) == events["empty"]
    assert sum(row["triggers"] for row in events["records"]) == events["triggers"]
    k6 = next(row for row in events["records"] if row["model"] == "K6" and row["firmware"] == "2.8")
    assert k6["empty"] == events["k6Firmware28"]["empty"]
    assert k6["triggers"] == events["k6Firmware28"]["triggers"]
print("PASS 10 base/policy artifacts plus monthly aggregates, device/activity/renewal histories and 12 status snapshots match reviewed data; 12 weekly event facts and filter capability rebuild correctly; catalog, contract and diagnostics preserved")
print(f"Temporary output: {scratch}")
