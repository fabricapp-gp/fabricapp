from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import os
import io
import glob
from datetime import datetime
import json
import hashlib
import sys

# Ensure the current directory is in sys.path so core_logic can be found when run via python -m
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core_logic import (
    calculate_metrics,
    get_aggregated_fabrics,
    get_14day_avg_forecast,
    get_global_fabric_demand,
    get_fabric_usage,
    normalize_mapping_df,
    denormalize_for_save,
    standardize_fabric_name,
    normalize_style_name,
    validate_style_input,
    safe_float,
)

app = FastAPI(title="FABRICINTEL API")

# Configure CORS (allow localhost for dev and Vercel for production)
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://fabricapp.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ════════════════════════════════════════════════════
# Config
# ════════════════════════════════════════════════════

FABRIC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Vercel has a read-only filesystem — use /tmp for writable files
_IS_VERCEL = bool(os.environ.get("VERCEL"))
_WRITABLE_DIR = "/tmp" if _IS_VERCEL else FABRIC_DIR

# Original file in repo
MAPPING_SOURCE = os.path.join(FABRIC_DIR, "FABRIC MAPPING MAPPING - Sheet1.csv")
# Writable file for runtime
MAPPING_FILE = os.path.join(_WRITABLE_DIR, "FABRIC MAPPING MAPPING - Sheet1.csv")

FORECAST_FILE = os.path.join(_WRITABLE_DIR, "forecast_output.csv")
ORDERS_MASTER = os.path.join(_WRITABLE_DIR, "orders_master.csv")
TRAINING_FILE = os.path.join(_WRITABLE_DIR, "prophet_training_data.csv")
SAVED_INPUTS_FILE = os.path.join(_WRITABLE_DIR, "saved_inputs.json")
AUDIT_LOG_FILE = os.path.join(_WRITABLE_DIR, "audit_log.json")
USERS_FILE = os.path.join(_WRITABLE_DIR, "users.json")
EMAIL_CONFIG_FILE = os.path.join(_WRITABLE_DIR, "email_config.json")

# On Vercel, seed writable files from the repo copy if they don't exist in /tmp yet
if _IS_VERCEL:
    for _fname in ["forecast_output.csv", "audit_log.json", "users.json", "FABRIC MAPPING MAPPING - Sheet1.csv"]:
        _src = os.path.join(FABRIC_DIR, _fname)
        _dst = os.path.join(_WRITABLE_DIR, _fname)
        if os.path.exists(_src) and not os.path.exists(_dst):
            import shutil
            shutil.copy2(_src, _dst)

# Try to load .env.local so the Python backend can also read NEXT_PUBLIC_ vars
try:
    from dotenv import load_dotenv  # type: ignore
    _env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
    if os.path.exists(_env_path):
        load_dotenv(_env_path, override=False)
        print(f"INFO: Loaded environment from {_env_path}")
except ImportError:
    pass  # python-dotenv not installed, skip silently


# ════════════════════════════════════════════════════
# User Management (file-based: users.json)
# ════════════════════════════════════════════════════

_DEFAULT_ADMIN = {"admin": {"password": "admin123", "role": "Admin"}}

def _load_users() -> dict:
    """Load users from users.json.
    
    If users.json doesn't exist yet, seed it from the FABRICINTEL_USERS
    env variable (if set), or create it with a default admin account.
    """
    # If users.json exists, use it as the single source of truth
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r") as f:
                data = json.load(f)
            if isinstance(data, dict) and data:
                return data
        except Exception:
            pass

    # First run: seed from env variable or use default
    seed_users = _DEFAULT_ADMIN.copy()
    raw = os.environ.get("FABRICINTEL_USERS", "")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed:
                seed_users = parsed
                print("INFO: Seeded users.json from FABRICINTEL_USERS env variable.")
        except Exception as e:
            print(f"WARNING: Failed to parse FABRICINTEL_USERS: {e}. Using default admin.")
    else:
        print("INFO: No users.json found and FABRICINTEL_USERS not set. Creating default admin account.")

    _save_users(seed_users)
    return seed_users

def _save_users(users: dict):
    """Persist users to users.json."""
    try:
        with open(USERS_FILE, "w") as f:
            json.dump(users, f, indent=2)
    except Exception as e:
        print(f"ERROR: Failed to save users.json: {e}")

# Load once at startup; mutable dict so GUI changes take effect immediately
USERS: dict = _load_users()


# ════════════════════════════════════════════════════
# Audit Log
# ════════════════════════════════════════════════════

def _load_audit_log() -> list:
    """Load the audit log from JSON file."""
    if os.path.exists(AUDIT_LOG_FILE):
        try:
            with open(AUDIT_LOG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def _append_audit(action: str, user: str, details: str):
    """Append an entry to the audit log."""
    log = _load_audit_log()
    log.append({
        "action": action,
        "user": user,
        "details": details,
        "timestamp": datetime.now().strftime("%d %b %Y, %I:%M %p"),
    })
    try:
        with open(AUDIT_LOG_FILE, "w") as f:
            json.dump(log, f, indent=2)
    except Exception as e:
        print(f"Failed to write audit log: {e}")


# ════════════════════════════════════════════════════
# Models
# ════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    username: str
    role: str
    token: str

class StyleArchiveRequest(BaseModel):
    style_name: str
    archive: bool
    user: str
    studio_overrides: dict = {}

class StyleAddRequest(BaseModel):
    user: str
    style_name: str
    fabric_family: str = ""
    fabric1: str = ""
    fabric1_cm: float = 0
    fabric2: str = ""
    fabric2_cm: float = 0
    lining: str = ""
    lining_cm: float = 0
    studio_overrides: dict = {}

class SaveInventoryRequest(BaseModel):
    fabric_name: str
    inventory: float = 0.0
    wip: float = 0.0
    lead_time: int = 7
    buffer_days: int = 2
    moq: float = 50.0

class SaveAllInventoryRequest(BaseModel):
    user: str
    items: List[SaveInventoryRequest]


class DashboardRequest(BaseModel):
    family: str = ""
    forecast_data: List[dict] = []

class StudioRequest(BaseModel):
    forecast_data: List[dict] = []
    studio_overrides: dict = {}

# ════════════════════════════════════════════════════
# Data Loaders
# ════════════════════════════════════════════════════

def apply_studio_overrides(df: pd.DataFrame, overrides: dict) -> pd.DataFrame:
    if not overrides: return df
    
    # 1. Added
    added = overrides.get("added", [])
    if added:
        new_df = pd.DataFrame(added)
        df = pd.concat([df, new_df], ignore_index=True)
        
    # 2. Archived
    archived = overrides.get("archived", {})
    if archived:
        for s_name, is_arch in archived.items():
            mask = df["style_name"].str.strip().str.lower() == s_name.strip().lower()
            if mask.any():
                df.loc[mask, "status"] = "Archived" if is_arch else "Active"
                
    # 3. Updated
    updated = overrides.get("updated", {})
    if updated:
        for s_name, updates in updated.items():
            mask = df["style_name"].str.strip().str.lower() == s_name.strip().lower()
            if mask.any():
                for k, v in updates.items():
                    if k in df.columns:
                        df.loc[mask, k] = v
                        
    return df


def get_mapping() -> pd.DataFrame:
    """Load and normalize the fabric mapping CSV."""
    try:
        if not os.path.exists(MAPPING_FILE):
             # Fallback to source if writable copy missing (shouldn't happen with seeding)
             if os.path.exists(MAPPING_SOURCE):
                 return normalize_mapping_df(pd.read_csv(MAPPING_SOURCE))
             raise HTTPException(status_code=500, detail="Fabric mapping file not found")
        
        df = pd.read_csv(MAPPING_FILE)
        return normalize_mapping_df(df)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def load_forecast_from_client(forecast_data: List[dict]) -> pd.DataFrame:
    """Load forecast data sent from the frontend client instead of reading from disk."""
    try:
        if not forecast_data:
            return pd.DataFrame()
        df = pd.DataFrame(forecast_data)
        if "ds" in df.columns:
            df["ds"] = pd.to_datetime(df["ds"])
        for col in ["yhat", "yhat_lower", "yhat_upper"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        return df
    except Exception:
        return pd.DataFrame()

def load_forecast() -> pd.DataFrame:
    """Legacy load forecast output CSV (fallback if needed)."""
    try:
        if not os.path.exists(FORECAST_FILE):
            return pd.DataFrame()
        df = pd.read_csv(FORECAST_FILE)
        df["ds"] = pd.to_datetime(df["ds"])
        for col in ["yhat", "yhat_lower", "yhat_upper"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
        return df
    except Exception:
        return pd.DataFrame()


def get_forecast_freshness(client_timestamp: str = None):
    """Get forecast file freshness status. Relies on client timestamp if provided."""
    try:
        if client_timestamp:
            try:
                last_update = datetime.strptime(client_timestamp, "%d %b %Y, %I:%M %p")
            except Exception:
                last_update = datetime.fromisoformat(client_timestamp) if "T" in client_timestamp else datetime.now()
        elif os.path.exists(FORECAST_FILE):
            file_time = os.path.getmtime(FORECAST_FILE)
            last_update = datetime.fromtimestamp(file_time)
        else:
            return None, None, "Stale"
        
        hours_old = (datetime.now() - last_update).total_seconds() / 3600
        days_old = hours_old / 24
        if days_old <= 2:
            freshness = "Fresh"
        elif days_old <= 5:
            freshness = "Warning"
        else:
            freshness = "Stale"
        return last_update, hours_old, freshness
    except Exception:
        return None, None, "Stale"


def load_saved_inputs() -> dict:
    """Load saved inventory inputs from JSON."""
    if os.path.exists(SAVED_INPUTS_FILE):
        try:
            with open(SAVED_INPUTS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_inputs_to_file(data: dict):
    """Save inventory inputs to JSON."""
    with open(SAVED_INPUTS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def get_saved_input(fabric_name: str) -> dict:
    """Get saved inventory input for a specific fabric."""
    inputs = load_saved_inputs()
    return inputs.get(fabric_name, {
        "inventory": 0.0,
        "wip": 0.0,
        "lead_time": 7,
        "buffer_days": 2,
        "moq": 50.0,
    })


# ════════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════════

@app.post("/api/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    if req.username in USERS and USERS[req.username]["password"] == req.password:
        # Generate a simple session token from username + timestamp
        token_raw = f"{req.username}:{datetime.now().isoformat()}"
        token = str(hashlib.sha256(token_raw.encode()).hexdigest())[:32]
        _append_audit("LOGIN", req.username, f"{req.username} logged in")
        return LoginResponse(  # type: ignore
            username=req.username,
            role=USERS[req.username]["role"],
            token=token
        )
    raise HTTPException(status_code=401, detail="Invalid credentials")


# ════════════════════════════════════════════════════
# ADMIN ENDPOINTS (Admin-only)
# ════════════════════════════════════════════════════

class AdminCheckRequest(BaseModel):
    requesting_user: str

def _assert_admin(username: str):
    """Raise 403 if the user is not an Admin."""
    if username not in USERS or USERS[username].get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin access required")

@app.get("/api/admin/users")
async def list_users(requesting_user: str = ""):
    """List all users (no passwords). Admin-only."""
    _assert_admin(requesting_user)
    return [
        {"username": uname, "role": info.get("role", "Viewer")}
        for uname, info in USERS.items()
    ]

@app.get("/api/admin/audit-log")
async def get_audit_log(requesting_user: str = ""):
    """Get the full audit trail. Admin-only."""
    _assert_admin(requesting_user)
    log = _load_audit_log()
    # Return newest first
    return list(reversed(log))


class AddUserRequest(BaseModel):
    requesting_user: str
    username: str
    password: str
    role: str  # "Admin" or "Viewer"

class DeleteUserRequest(BaseModel):
    requesting_user: str
    username: str

@app.post("/api/admin/users/add")
async def add_user(req: AddUserRequest):
    """Add a new user via the Admin GUI. Persisted to users.json."""
    _assert_admin(req.requesting_user)

    if not req.username.strip() or not req.password.strip():
        raise HTTPException(status_code=400, detail="Username and password are required")

    if req.role not in ("Admin", "Viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'Admin' or 'Viewer'")

    if req.username.strip().lower() in [u.lower() for u in USERS]:
        raise HTTPException(status_code=400, detail=f"User '{req.username}' already exists")

    USERS[req.username.strip()] = {"password": req.password, "role": req.role}
    _save_users(USERS)
    _append_audit("ADD_USER", req.requesting_user, f"{req.requesting_user} created user: {req.username} (role: {req.role})")

    return {"success": True, "message": f"User '{req.username}' created successfully"}


@app.post("/api/admin/users/delete")
async def delete_user(req: DeleteUserRequest):
    """Delete a user via the Admin GUI. Persisted to users.json."""
    _assert_admin(req.requesting_user)

    if req.username.strip().lower() == req.requesting_user.strip().lower():
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    if req.username not in USERS:
        raise HTTPException(status_code=404, detail=f"User '{req.username}' not found")

    USERS.pop(req.username, None)  # Use pop for safer deletion
    _save_users(USERS)
    _append_audit("DELETE_USER", req.requesting_user, f"{req.requesting_user} deleted user: {req.username}")

    return {"success": True, "message": f"User '{req.username}' deleted successfully"}


# ════════════════════════════════════════════════════
# SYSTEM METRICS
# ════════════════════════════════════════════════════

@app.get("/api/system/metrics")
async def get_system_metrics():
    df = get_mapping()
    last_update_dt, hours_old, freshness = get_forecast_freshness()
    
    return {
        "styles_detected": df["style_name"].nunique(),
        "fabric_families": df["fabric_family"].nunique(),
        "forecast_status": freshness,
        "forecast_updated_str": last_update_dt.strftime("%d %b %Y %H:%M") if last_update_dt else "Never",
        "hours_old": round(hours_old, 1) if hours_old is not None else None,  # type: ignore
    }


# ════════════════════════════════════════════════════
# STUDIO ENDPOINTS
# ════════════════════════════════════════════════════

@app.post("/api/studio/styles")
async def get_studio_styles(req: StudioRequest):
    df = apply_studio_overrides(get_mapping(), req.studio_overrides)
    forecast_df = load_forecast_from_client(req.forecast_data) if req.forecast_data else load_forecast()
    
    active = df[df["status"] == "Active"]
    archived = df[df["status"] == "Archived"]
    
    # Convert to records with cleaned fabric names and include demand
    def clean_row(row):
        result = {}
        result["style_name"] = str(row.get("style_name", ""))
        family = str(row.get("fabric_family", ""))
        result["fabric_family"] = family
        result["main1_name"] = str(row.get("main1_name", "")) if row.get("main1_name") else ""
        result["main1_cm"] = safe_float(row.get("main1_cm", 0))
        result["main2_name"] = str(row.get("main2_name", "")) if row.get("main2_name") else ""
        result["main2_cm"] = safe_float(row.get("main2_cm", 0))
        result["lining_name"] = str(row.get("lining_name", "")) if row.get("lining_name") else ""
        result["lining_cm"] = safe_float(row.get("lining_cm", 0))
        result["last_updated_by"] = str(row.get("last_updated_by", "")) if pd.notna(row.get("last_updated_by")) else ""
        result["last_updated_time"] = str(row.get("last_updated_time", "")) if pd.notna(row.get("last_updated_time")) else ""
        result["status"] = str(row.get("status", "Active"))
        
        # Get demand for this family if available
        avg_demand, _, _ = get_14day_avg_forecast(forecast_df, family)
        result["predicted_demand"] = round(avg_demand, 1) if avg_demand is not None else 0.0
        
        return result
    
    active_rows = [clean_row(row) for _, row in active.iterrows()]
    archived_rows = [clean_row(row) for _, row in archived.iterrows()]
    
    return {
        "active": active_rows,
        "archived": archived_rows,
        "total": len(df),
    }


@app.patch("/api/studio/styles/update")
async def update_style(req: StyleAddRequest):
    df = apply_studio_overrides(get_mapping(), req.studio_overrides)
    if req.style_name.strip().lower() not in df["style_name"].str.strip().str.lower().values:
        raise HTTPException(status_code=404, detail="Style not found")
    
    # Standardize fabric names
    fabric1_clean = standardize_fabric_name(req.fabric1)
    fabric2_clean = standardize_fabric_name(req.fabric2)
    lining_clean = standardize_fabric_name(req.lining)
    
    # Normalize family name
    fabric_family = req.fabric_family.strip() if req.fabric_family.strip() else normalize_style_name(req.style_name)
    current_time = datetime.now().strftime("%d %b %Y, %I:%M %p")
    
    df["last_updated_by"] = df["last_updated_by"].astype(str)
    df["last_updated_time"] = df["last_updated_time"].astype(str)
    
    mask = df["style_name"].str.strip().str.lower() == req.style_name.strip().lower()
    df.loc[mask, "fabric_family"] = fabric_family
    df.loc[mask, "main1_name"] = fabric1_clean
    df.loc[mask, "main1_cm"] = req.fabric1_cm if fabric1_clean else 0
    df.loc[mask, "main2_name"] = fabric2_clean
    df.loc[mask, "main2_cm"] = req.fabric2_cm if fabric2_clean else 0
    df.loc[mask, "lining_name"] = lining_clean
    df.loc[mask, "lining_cm"] = req.lining_cm if lining_clean else 0
    df.loc[mask, "last_updated_by"] = req.user
    df.loc[mask, "last_updated_time"] = current_time
    
    save_df = denormalize_for_save(df)
    save_df.to_csv(MAPPING_FILE, index=False)
    
    _append_audit("UPDATE_BOM", req.user, f"{req.user} updated BOM for style: {req.style_name}")
    
    return {"success": True, "message": "Style BOM updated successfully"}


@app.post("/api/studio/styles/archive")
async def toggle_style_archive(req: StyleArchiveRequest):
    df = apply_studio_overrides(get_mapping(), req.studio_overrides)
    
    if req.style_name.strip().lower() not in df["style_name"].str.strip().str.lower().values:
        raise HTTPException(status_code=404, detail="Style not found")
    
    status = "Archived" if req.archive else "Active"
    
    df["last_updated_by"] = df["last_updated_by"].astype(str)
    df["last_updated_time"] = df["last_updated_time"].astype(str)
    
    mask = df["style_name"].str.strip().str.lower() == req.style_name.strip().lower()
    df.loc[mask, "status"] = status
    df.loc[mask, "last_updated_by"] = req.user
    df.loc[mask, "last_updated_time"] = datetime.now().strftime("%d %b %Y, %I:%M %p")
    
    save_df = denormalize_for_save(df)
    save_df.to_csv(MAPPING_FILE, index=False)
    
    action = "ARCHIVE_STYLE" if req.archive else "RESTORE_STYLE"
    _append_audit(action, req.user, f"{req.user} {'archived' if req.archive else 'restored'} style: {req.style_name}")
    
    return {"success": True, "message": f"Style {req.style_name} {'archived' if req.archive else 'restored'} successfully"}


@app.post("/api/studio/styles/add")
async def add_style(req: StyleAddRequest):
    df = apply_studio_overrides(get_mapping(), req.studio_overrides)
    
    # Validate input
    existing_styles = df["style_name"].tolist()
    errors = validate_style_input(
        req.style_name, req.fabric1, req.fabric1_cm,
        req.fabric2, req.fabric2_cm, req.lining, req.lining_cm,
        existing_styles
    )
    
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    
    # Standardize fabric names
    fabric1_clean = standardize_fabric_name(req.fabric1)
    fabric2_clean = standardize_fabric_name(req.fabric2)
    lining_clean = standardize_fabric_name(req.lining)
    
    # Normalize family name
    fabric_family = req.fabric_family.strip() if req.fabric_family.strip() else normalize_style_name(req.style_name)
    
    current_time = datetime.now().strftime("%d %b %Y, %I:%M %p")
    
    new_row = pd.DataFrame([{
        "fabric_family": fabric_family,
        "style_name": req.style_name.strip(),
        "main1_name": fabric1_clean,
        "main1_cm": req.fabric1_cm if fabric1_clean else 0,
        "main2_name": fabric2_clean,
        "main2_cm": req.fabric2_cm if fabric2_clean else 0,
        "lining_name": lining_clean,
        "lining_cm": req.lining_cm if lining_clean else 0,
        "status": "Active",
        "last_updated_by": req.user,
        "last_updated_time": current_time,
    }])
    
    df = pd.concat([df, new_row], ignore_index=True)
    save_df = denormalize_for_save(df)
    save_df.to_csv(MAPPING_FILE, index=False)
    
    _append_audit("CREATE_STYLE", req.user, f"{req.user} created style: {req.style_name} (family: {fabric_family})")
    
    return {"success": True, "message": "Style BOM saved successfully", "style": req.style_name}


@app.post("/api/studio/upload-csv")
async def upload_bom_csv(file: UploadFile = File(...)):
    """Upload BOM CSV and detect columns for mapping."""
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")
    
    columns = df.columns.tolist()
    sample_data = df.head(5).fillna("").to_dict(orient="records")
    
    return {
        "columns": columns,
        "row_count": len(df),
        "sample_data": sample_data,
    }


@app.post("/api/studio/import-csv")
async def import_bom_csv(file: UploadFile = File(...), column_map: str = "{}"):
    """Import BOM CSV with user-defined column mapping."""
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
        col_map = json.loads(column_map)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {e}")
    
    # Apply column mapping
    if col_map:
        df = df.rename(columns=col_map)
    
    # Normalize and append to existing
    existing = get_mapping()
    new_df = normalize_mapping_df(df)
    combined = pd.concat([existing, new_df], ignore_index=True)
    combined = combined.drop_duplicates(subset=["style_name"], keep="last")
    
    save_df = denormalize_for_save(combined)
    save_df.to_csv(MAPPING_FILE, index=False)
    
    return {"success": True, "imported": len(new_df), "total": len(combined)}


# ════════════════════════════════════════════════════
# FORECAST ENDPOINTS
# ════════════════════════════════════════════════════

@app.get("/api/forecast/status")
async def forecast_status():
    """Get forecast freshness and metadata."""
    last_update_dt, hours_old, freshness = get_forecast_freshness()
    
    result = {
        "freshness": freshness,
        "hours_old": round(hours_old, 1) if hours_old is not None else None,  # type: ignore
        "last_update": last_update_dt.strftime("%d %b %Y, %I:%M %p") if last_update_dt is not None else None,
    }
    
    # Add history stats if available
    if os.path.exists(TRAINING_FILE):
        try:
            df = pd.read_csv(TRAINING_FILE)
            result["total_rows"] = len(df)
            result["styles_forecasted"] = df["STYLE_GROUP"].nunique() if "STYLE_GROUP" in df.columns else 0
        except Exception:
            pass
    
    return result


@app.post("/api/forecast/upload")
async def upload_orders(file: UploadFile = File(...)):
    """Upload Shopify orders CSV, clean, and prepare training data."""
    import re
    
    content = await file.read()
    try:
        new_orders = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")
    
    # Normalize column names for resilient matching (clean whitespace)
    original_columns: List[str] = list(new_orders.columns)
    new_orders.columns = [str(c).strip() for c in new_orders.columns]
    
    # Map to canonical names
    canonical_map: dict = {
        "Created at": "Created at",
        "Lineitem name": "Lineitem name",
        "Lineitem quantity": "Lineitem quantity"
    }
    rename_dict = {}
    for target, canonical in canonical_map.items():
        match = next((c for c in new_orders.columns if c.lower() == target.lower()), None)
        if match:
            rename_dict[match] = canonical
            
    missing = [c for c in canonical_map.values() if c not in rename_dict.values()]
    if missing:
        actual_cols_str = ", ".join(original_columns[:8]) + "..."
        raise HTTPException(
            status_code=400, 
            detail=f"Missing required columns: {', '.join(missing)}. Found: {actual_cols_str}"
        )
    
    # Rename and keep only necessary columns for the master file if you prefer, 
    # but for now we rename all and keep others for history.
    new_orders = new_orders.rename(columns=rename_dict)
    
    # Data cleaning pipeline
    cleaning_log = []
    original_count = len(new_orders)
    
    # 1. Drop nulls in required columns
    new_orders = new_orders.dropna(subset=["Created at", "Lineitem name", "Lineitem quantity"])
    after_null = len(new_orders)
    if original_count - after_null > 0:
        cleaning_log.append(f"Removed {original_count - after_null} rows with missing values")
    
    # 2. Remove cancelled/test orders
    before = len(new_orders)
    new_orders = new_orders[
        ~new_orders["Lineitem name"].astype(str).str.contains("test|sample|cancel|draft", case=False, na=False)
    ]
    removed = before - len(new_orders)
    if removed > 0:
        cleaning_log.append(f"Removed {removed} test/cancelled/draft orders")
    
    # 3. Remove accessories
    before = len(new_orders)
    new_orders = new_orders[
        ~new_orders["Lineitem name"].astype(str).str.contains(
            "bag|belt|scarf|earring|necklace|scrunchie|accessory|gift|shipping",
            case=False, na=False
        )
    ]
    removed = before - len(new_orders)
    if removed > 0:
        cleaning_log.append(f"Excluded {removed} accessory items/shipping costs")
    
    # 4. Convert dates
    new_orders["Created at"] = pd.to_datetime(new_orders["Created at"], errors="coerce")
    
    # 5. Append to master
    if os.path.exists(ORDERS_MASTER):
        master = pd.read_csv(ORDERS_MASTER)
        # Ensure master also has canonical names if it was saved differently before
        combined = pd.concat([master, new_orders], ignore_index=True)
    else:
        combined = new_orders
    
    combined = combined.drop_duplicates()
    combined.to_csv(ORDERS_MASTER, index=False)
    
    # 6. Prepare training data
    combined["Created at"] = pd.to_datetime(combined["Created at"], errors="coerce").dt.date
    df = combined[["Created at", "Lineitem name", "Lineitem quantity"]].copy()
    df.columns = ["ds", "STYLE_GROUP", "y"]
    df = df.dropna()
    
    # Standardize style names (remove size suffixes like -XS, -S, etc)
    df["STYLE_GROUP"] = df["STYLE_GROUP"].apply(
        lambda x: re.sub(r"\s*-\s*(XS|S|M|L|XL|XXL|2XL|3XL)$", "", str(x).upper(), flags=re.IGNORECASE).strip()
    )
    
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0)
    
    training = df.groupby(["ds", "STYLE_GROUP"])["y"].sum().reset_index()
    training.to_csv(TRAINING_FILE, index=False)
    
    # Preview stats
    date_min = training["ds"].min()
    date_max = training["ds"].max()
    
    return {
        "success": True,
        "cleaning_log": cleaning_log,
        "total_rows": len(training),
        "unique_styles": int(training["STYLE_GROUP"].nunique()),
        "date_range": f"{date_min} — {date_max}",
        "master_total": len(combined),
    }


@app.post("/api/forecast/run")
async def run_forecast():
    """Execute the Prophet forecast pipeline."""
    if not os.path.exists(TRAINING_FILE):
        raise HTTPException(status_code=400, detail="Training data not found. Upload orders first.")
    
    try:
        from prophet import Prophet  # type: ignore
    except ImportError:
        raise HTTPException(status_code=500, detail="Prophet is not installed. Run: pip install prophet")
    
    data = pd.read_csv(TRAINING_FILE)
    data["ds"] = pd.to_datetime(data["ds"])
    
    style_groups = sorted(data["STYLE_GROUP"].unique())
    forecasts = []
    logs = []
    skipped = 0
    
    for style in style_groups:
        df_style = data[data["STYLE_GROUP"] == style][["ds", "y"]]
        
        if len(df_style) < 5:
            logs.append(f"Skipped {style} — insufficient data ({len(df_style)} rows)")
            skipped: int = skipped + 1
            continue
        
        try:
            model = Prophet(
                weekly_seasonality=True,
                yearly_seasonality=False,
                daily_seasonality=False,
            )
            model.fit(df_style)
            
            future = model.make_future_dataframe(periods=30)
            forecast = model.predict(future)
            
            for col in ["yhat", "yhat_lower", "yhat_upper"]:
                forecast[col] = pd.to_numeric(forecast[col], errors="coerce").fillna(0)
            
            forecast["Fabric_Family_GROUP"] = style
            forecasts.append(
                forecast[["Fabric_Family_GROUP", "ds", "yhat", "yhat_lower", "yhat_upper"]]
            )
            logs.append(f"Trained {style}")
        except Exception as e:
            logs.append(f"ERROR for {style}: {e}")
    
    if not forecasts:
        return {"success": False, "message": "No styles had enough data for forecasting", "logs": logs}
    
    forecast_output = pd.concat(forecasts, ignore_index=True)
    forecast_output.to_csv(FORECAST_FILE, index=False)
    
    return {
        "success": True,
        "message": "Forecast generated successfully",
        "styles_forecasted": len(forecasts),
        "styles_skipped": skipped,
        "total_rows": len(forecast_output),
        "logs": logs,
        "forecast_data": forecast_output.to_dict(orient="records")
    }


# ════════════════════════════════════════════════════
# DASHBOARD ENDPOINTS
# ════════════════════════════════════════════════════

@app.get("/api/dashboard/families")
async def get_dashboard_families():
    """Return sorted list of active fabric families for the dropdown."""
    mapping_df = get_mapping()
    active_df = mapping_df[mapping_df["status"] == "Active"]
    families = sorted(active_df["fabric_family"].dropna().unique().tolist())
    return families


class DashboardSummaryRequest(BaseModel):
    family: str = ""
    forecast_data: List[dict] = []
    forecast_timestamp: str = ""
    studio_overrides: dict = {}

@app.post("/api/dashboard/summary")
async def get_dashboard_summary(req: DashboardSummaryRequest):
    """Control Tower summary with real computed metrics."""
    mapping_df = apply_studio_overrides(get_mapping(), req.studio_overrides)
    forecast_df = load_forecast_from_client(req.forecast_data) if req.forecast_data else load_forecast()
    saved_inputs = load_saved_inputs()
    
    active_df = mapping_df[mapping_df["status"] == "Active"]
    if req.family:
        active_df = active_df[active_df["fabric_family"].str.strip().str.lower() == req.family.strip().lower()]
    families = sorted(active_df["fabric_family"].dropna().unique())
    
    total_14d_demand: float = 0.0
    total_reorder: float = 0.0
    critical_risks: int = 0
    warnings: int = 0
    total_fabrics: int = 0
    
    last_update_dt, hours_old, freshness = get_forecast_freshness(req.forecast_timestamp)
    
    for family in families:
        style_demand, _, _ = get_14day_avg_forecast(forecast_df, family)
        safe_demand = safe_float(style_demand, 0.0)
        
        fabrics = get_aggregated_fabrics(mapping_df, family)
        
        for fab in fabrics:
            total_fabrics = total_fabrics + 1
            ratio = fab.get("ratio", 0)
            demand_daily = (safe_demand or 0) * ratio
            total_14d_demand = total_14d_demand + (demand_daily * 14)
            
            # Use saved inputs or defaults — compound key prevents cross-family mixing
            compound_key = f"{family}::{fab['name']}"
            inp = saved_inputs.get(compound_key, saved_inputs.get(fab["name"], {}))
            inv = inp.get("inventory", 0.0)
            wip = inp.get("wip", 0.0)
            lead = inp.get("lead_time", 7)
            buffer = inp.get("buffer_days", 2)
            moq = inp.get("moq", 50.0)
            
            # Convert WIP (pcs) to WIP (m) using consumption_cm
            wip_m = (wip * fab.get("consumption_cm", 0)) / 100.0
            
            _, coverage, reorder, risk = calculate_metrics(
                demand_daily, inv, wip_m, lead, buffer, moq
            )
            total_reorder = total_reorder + float(reorder)
            
            if risk == "Critical":
                critical_risks = critical_risks + 1
            elif risk == "Warning":
                warnings = warnings + 1
    
    return {
        "active_styles": len(active_df["style_name"].unique()),
        "active_families": len(families),
        "total_fabrics": total_fabrics,
        "total_14d_demand": round(float(total_14d_demand), 1) if total_14d_demand else 0, # type: ignore
        "total_reorder": round(float(total_reorder), 1) if total_reorder else 0, # type: ignore
        "critical_risks": critical_risks,
        "warnings": warnings,
        "forecast_freshness": freshness,
        "forecast_hours_old": round(float(hours_old), 1) if hours_old is not None else None, # type: ignore
        "forecast_last_update": last_update_dt.strftime("%d %b %Y, %I:%M %p") if last_update_dt is not None else None,
    }


@app.post("/api/dashboard/fabrics")
async def get_dashboard_fabrics(req: DashboardSummaryRequest, background_tasks: BackgroundTasks):
    """Get active fabric families with demand, risk, and inventory data."""
    mapping_df = apply_studio_overrides(get_mapping(), req.studio_overrides)
    forecast_df = load_forecast_from_client(req.forecast_data) if req.forecast_data else load_forecast()
    saved_inputs = load_saved_inputs()
    
    active_df = mapping_df[mapping_df["status"] == "Active"]
    if req.family:
        active_df = active_df[active_df["fabric_family"].str.strip().str.lower() == req.family.strip().lower()]
    families = sorted(active_df["fabric_family"].dropna().unique())
    
    results = []
    new_criticals = []
    
    for family in families:
        style_demand, yhat_lower, yhat_upper = get_14day_avg_forecast(forecast_df, family)
        safe_demand = safe_float(style_demand, 0.0)
        
        fabrics = get_aggregated_fabrics(mapping_df, family)
        if not fabrics:
            continue
        
        family_fabrics = []
        for fab in fabrics:
            ratio = fab["ratio"]
            demand_daily = (safe_demand or 0) * ratio
            demand_14d = demand_daily * 14
            
            # Use saved inputs or defaults — compound key prevents cross-family mixing
            compound_key = f"{family}::{fab['name']}"
            inp = saved_inputs.get(compound_key, saved_inputs.get(fab["name"], {}))
            inv = inp.get("inventory", 0.0)
            wip = inp.get("wip", 0.0)
            lead = inp.get("lead_time", 7)
            buffer = inp.get("buffer_days", 2)
            moq = inp.get("moq", 50.0)
            
            # Convert WIP (pcs) to WIP (m)
            wip_m = (wip * fab["consumption_cm"]) / 100.0
            
            available, coverage, reorder, risk = calculate_metrics(
                demand_daily, inv, wip_m, lead, buffer, moq
            )
            
            if risk == "Critical":
                if compound_key not in alerted_fabrics:
                    new_criticals.append({
                        "family": family,
                        "fabric": fab["name"],
                        "reorder": round(float(reorder), 1) if reorder != float("inf") else 0,
                        "lead_time": lead,
                        "coverage": round(float(coverage), 1) if coverage != float("inf") else 999
                    })
                    alerted_fabrics.add(compound_key)
            
            family_fabrics.append({
                "name": fab["name"],
                "family": family,
                "compound_key": compound_key,
                "role": fab["role"],
                "consumption_cm": fab["consumption_cm"],
                "ratio": round(float(ratio), 4), # type: ignore
                "daily_demand": round(float(demand_daily), 2), # type: ignore
                "demand_14d": round(float(demand_14d), 1), # type: ignore
                "inventory": inv,
                "wip": wip,
                "lead_time": lead,
                "buffer_days": buffer,
                "moq": moq,
                "available": round(float(available), 1), # type: ignore
                "coverage_days": round(float(coverage), 1) if coverage != float("inf") else 999, # type: ignore
                "reorder_qty": round(float(reorder), 1), # type: ignore
                "status": risk,
                "used_in_styles": fab.get("used_in_styles", []),
                "alert_sent": compound_key in alerted_fabrics,
            })
        
        results.append({
            "family": family,
            "style_demand": round(float(safe_demand), 2), # type: ignore
            "confidence": f"{round(float(yhat_lower), 1)} — {round(float(yhat_upper), 1)}", # type: ignore
            "fabrics": family_fabrics,
        })
    
    if new_criticals:
        background_tasks.add_task(send_automated_risk_alert_bg, new_criticals)

    return results


@app.get("/api/dashboard/fabric-detail/{fabric_name}")
async def get_fabric_detail(fabric_name: str, family: str = ""):
    """Get detailed usage info for a specific fabric, optionally scoped to a family."""
    mapping_df = get_mapping()
    forecast_df = load_forecast()
    
    usage = get_fabric_usage(mapping_df, fabric_name, family_filter=family)
    
    # Get global demand for this fabric
    global_demand = get_global_fabric_demand(mapping_df, forecast_df)
    # Match by compound key if family is provided, otherwise by name
    if family:
        fabric_demand = next((f for f in global_demand if f["compound_key"] == f"{family}::{fabric_name.strip().lower()}"), None)
    else:
        fabric_demand = next((f for f in global_demand if f["fabric"] == fabric_name.strip().lower()), None)
    
    compound_key = f"{family}::{fabric_name.strip().lower()}" if family else fabric_name.strip().lower()
    saved = get_saved_input(compound_key)
    
    return {
        "fabric_name": fabric_name,
        "fabric_family": family,
        "main_usage": usage["main_usage"],
        "lining_usage": usage["lining_usage"],
        "demand": fabric_demand,
        "saved_inputs": saved,
    }


class GlobalDemandRequest(BaseModel):
    forecast_data: List[dict] = []

@app.post("/api/dashboard/global-demand")
async def get_global_demand(req: GlobalDemandRequest):
    """Get global fabric demand across all styles."""
    mapping_df = get_mapping()
    forecast_df = load_forecast_from_client(req.forecast_data) if req.forecast_data else load_forecast()
    return get_global_fabric_demand(mapping_df, forecast_df)


@app.post("/api/dashboard/save-inputs")
async def save_inventory_inputs(req: SaveAllInventoryRequest):
    """Save inventory inputs for fabrics."""
    inputs = load_saved_inputs()
    
    for item in req.items:
        inputs[item.fabric_name] = {
            "inventory": item.inventory,
            "wip": item.wip,
            "lead_time": item.lead_time,
            "buffer_days": item.buffer_days,
            "moq": item.moq,
            "last_updated_by": req.user,
            "last_updated_time": datetime.now().strftime("%d %b %Y, %I:%M %p"),
        }
    
    save_inputs_to_file(inputs)
    return {"success": True, "message": f"Saved inputs for {len(req.items)} fabric(s)"}


# ════════════════════════════════════════════════════
# EMAIL AND AUTOMATED ALERTS
# ════════════════════════════════════════════════════

import smtplib

alerted_fabrics = set()

def load_email_config():
    if os.path.exists(EMAIL_CONFIG_FILE):
        return json.load(open(EMAIL_CONFIG_FILE))
    return {}

def save_email_config(config):
    with open(EMAIL_CONFIG_FILE, "w") as f:
        json.dump(config, f)

class EmailConfigRequest(BaseModel):
    recipient: str

@app.get("/api/email/config")
async def get_email_config():
    return load_email_config()

@app.post("/api/email/config")
async def set_email_config(req: EmailConfigRequest):
    save_email_config(req.model_dump())
    return {"success": True}

def send_automated_risk_alert_bg(critical_alerts):
    config = load_email_config()
    recipient = config.get("recipient")
    if not recipient:
        return
        
    sender = os.environ.get("NEXT_PUBLIC_SENDER_EMAIL")
    password = os.environ.get("NEXT_PUBLIC_SENDER_PASSWORD")
    if not sender or not password:
        return
        
    for alert in critical_alerts:
        body = f"Collection: {alert['family']}\n\n"
        body += f"Fabric: {alert['fabric']}\n\n"
        body += "Risk Level: Critical\n\n"
        body += f"Reorder Required: {alert['reorder']} m\n\n"
        body += f"Lead Time: {alert['lead_time']} days\n\n"
        body += f"Current Coverage: {alert['coverage']} days\n"
        
        subject = "🚨 Fabric Risk Alert - FABRICINTEL"
        message = f"From: {sender}\nTo: {recipient}\nSubject: {subject}\n\n{body}"
        
        try:
            server = smtplib.SMTP("smtp.gmail.com", 587, timeout=10)
            server.starttls()
            server.login(sender, password)
            server.sendmail(sender, [recipient], message.encode('utf-8'))
            server.quit()
        except Exception as e:
            print(f"Error sending auto alert: {str(e)}")

class EmailTestRequest(BaseModel):
    sender: str
    password: str
    receivers: List[str]

@app.post("/api/email/test")
async def send_test_email(req: EmailTestRequest):
    # Retrieve config or default
    config = load_email_config()
    final_receivers = [config.get("recipient")] if config.get("recipient") else req.receivers
    
    test_alerts = [
        {"family": "Halo Collection", "fabric": "Main Fabric A", "reorder": 150.5, "lead_time": 14, "coverage": 3.2},
        {"family": "Onyx Setup", "fabric": "Lining Fabric B", "reorder": 45.0, "lead_time": 7, "coverage": 1.1}
    ]
    
    body = "🚨 FABRIC RISK ALERT - FABRICINTEL (TEST EMAIL)\n\n"
    for alert in test_alerts:
        body += f"Collection: {alert['family']}\n\n"
        body += f"Fabric: {alert['fabric']}\n\n"
        body += "Risk Level: Critical\n\n"
        body += f"Reorder Required: {alert['reorder']} m\n\n"
        body += f"Lead Time: {alert['lead_time']} days\n\n"
        body += f"Current Coverage: {alert['coverage']} days\n"
        body += "----------------------------------------\n\n"
        
    subject = "🚨 Fabric Risk Alert - FABRICINTEL (Test)"
    message = f"From: {req.sender}\nTo: {', '.join(final_receivers)}\nSubject: {subject}\n\n{body}"
    
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=10)
        server.starttls()
        server.login(req.sender, req.password)
        server.sendmail(req.sender, final_receivers, message.encode('utf-8'))
        server.quit()
        return {"success": True, "message": f"Test email successfully sent to {len(final_receivers)} recipient(s)!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMTP Error: {str(e)}")

class EmailTestConnectionRequest(BaseModel):
    sender: str
    password: str

@app.post("/api/email/test-connection")
async def test_email_connection(req: EmailTestConnectionRequest):
    """Test SMTP authentication without sending an email."""
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=10)
        server.starttls()
        server.login(req.sender, req.password)
        server.quit()
        return {"success": True, "message": "SMTP connection successful! Credentials are valid."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection Failed: {str(e)}")

class RiskAlertRequest(BaseModel):
    sender: str
    password: str
    receivers: List[str]
    family: str = ""  # optional: filter by collection
    forecast_data: List[dict] = []

@app.post("/api/email/risk-alert")
async def send_risk_alert(req: RiskAlertRequest):
    """Send email alert for Critical-risk fabrics."""
    mapping_df = get_mapping()
    forecast_df = load_forecast_from_client(req.forecast_data) if req.forecast_data else load_forecast()
    saved_inputs = load_saved_inputs()
    
    active_df = mapping_df[mapping_df["status"] == "Active"]
    if req.family:
        active_df = active_df[active_df["fabric_family"].str.strip().str.lower() == req.family.strip().lower()]
    families = sorted(active_df["fabric_family"].dropna().unique())
    
    critical_fabrics = []
    
    for family in families:
        style_demand, _, _ = get_14day_avg_forecast(forecast_df, family)
        safe_demand = safe_float(style_demand, 0.0)
        fabrics = get_aggregated_fabrics(mapping_df, family)
        
        for fab in fabrics:
            ratio = fab.get("ratio", 0)
            demand_daily = (safe_demand or 0) * ratio
            compound_key = f"{family}::{fab['name']}"
            inp = saved_inputs.get(compound_key, saved_inputs.get(fab["name"], {}))
            inv = inp.get("inventory", 0.0)
            wip = inp.get("wip", 0.0)
            lead = inp.get("lead_time", 7)
            buffer = inp.get("buffer_days", 2)
            moq = inp.get("moq", 50.0)
            wip_m = (wip * fab.get("consumption_cm", 0)) / 100.0
            
            _, coverage, reorder, risk = calculate_metrics(
                demand_daily, inv, wip_m, lead, buffer, moq
            )
            
            if risk == "Critical":
                critical_fabrics.append({
                    "family": family,
                    "fabric": fab["name"],
                    "reorder": round(float(reorder), 1),
                    "risk": risk,
                })
    
    if not critical_fabrics:
        return {"success": True, "message": "No critical fabrics found. No email sent."}
    
    # Format email body
    body = "🚨 FABRIC RISK ALERT — FABRICINTEL\n\n"
    by_family = {}
    for cf in critical_fabrics:
        by_family.setdefault(cf["family"], []).append(cf)
    
    for fam, items in sorted(by_family.items()):
        body += f"Collection: {fam}\n"
        body += "Critical Fabrics:\n"
        for item in items:
            body += f"  • {item['fabric']} → Reorder {item['reorder']}m\n"
        body += "\n"
    
    body += "Please take immediate action.\n"
    
    subject = "Fabric Risk Alert - FABRICINTEL"
    if req.family:
        subject += f" ({req.family})"
    
    message = f"From: {req.sender}\nTo: {', '.join(req.receivers)}\nSubject: {subject}\n\n{body}"
    
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(req.sender, req.password)
        server.sendmail(req.sender, req.receivers, message.encode('utf-8'))
        server.quit()
        return {
            "success": True, 
            "message": f"Risk alert sent for {len(critical_fabrics)} critical fabric(s) to {len(req.receivers)} recipient(s)!",
            "critical_count": len(critical_fabrics),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
