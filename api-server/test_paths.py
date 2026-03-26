import os
import sys

# Mimic main.py path logic
FABRIC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_IS_VERCEL = bool(os.environ.get("VERCEL"))
_WRITABLE_DIR = "/tmp" if _IS_VERCEL else FABRIC_DIR

print(f"FABRIC_DIR: {FABRIC_DIR}")
print(f"_IS_VERCEL: {_IS_VERCEL}")
print(f"_WRITABLE_DIR: {_WRITABLE_DIR}")

for fname in ["forecast_output.csv", "orders_master.csv", "prophet_training_data.csv", "saved_inputs.json"]:
    fpath = os.path.join(_WRITABLE_DIR, fname)
    exists = os.path.exists(fpath)
    print(f"{fname} exists: {exists} at {fpath}")
