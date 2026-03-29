import pandas as pd  # type: ignore
import re
from typing import Dict, List, Set, Tuple, Optional


# ═══════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════

def safe_float(val, default_val=0.0):
    try:
        return float(val) if pd.notna(val) and val != "" else default_val
    except Exception:
        return default_val


def standardize_fabric_name(name) -> str:
    """Standardize fabric names for consistent matching across all layers."""
    if pd.isna(name) or str(name).strip().lower() in ("", "0", "nan", "none"):
        return ""
    return str(name).strip().lower()


def normalize_style_name(name: str) -> str:
    """Normalize style family names for matching with forecast data."""
    name = str(name).strip()
    name = re.sub(r'([A-Z])\1+', r'\1', name)
    name = re.sub(r'(?i)\bWoven\b', '', name)
    name = re.sub(r'(?i)\bKnit\b|\bJersey\b', '', name)
    return name.strip()


# ═══════════════════════════════════════════════════
# COLUMN NORMALIZATION
# ═══════════════════════════════════════════════════

# The CSV has inconsistent column names. This map normalizes them.
COLUMN_MAP = {
    "Fabric Family":                "fabric_family",
    "Style name":                   "style_name",
    "Main Fabric- 1 name":          "main1_name",
    "Main Fabric 1 Name":           "main1_name",
    "Main Fabric- 1 Consumption cm":"main1_cm",
    "Main Fabric 1 Consumption cm": "main1_cm",
    "Main fabric -2 name":          "main2_name",
    "Main Fabric 2 Name":           "main2_name",
    "Main fabric -2 consumption cm":"main2_cm",
    "Main Fabric 2 Consumption cm": "main2_cm",
    "Lining fabric":                "lining_name",
    "Lining Fabric":                "lining_name",
    "Lining Consumption cm":        "lining_cm",
    "Status":                       "status",
    "Style Status":                 "status",
    "Last Updated By":              "last_updated_by",
    "Last Updated Time":            "last_updated_time",
}

# Reverse map for saving back to CSV (use the original CSV header style)
SAVE_COLUMN_MAP = {
    "fabric_family":      "Fabric Family",
    "style_name":         "Style name",
    "main1_name":         "Main Fabric 1 Name",
    "main1_cm":           "Main Fabric 1 Consumption cm",
    "main1_m":            "Main Fabric 1 Consumption m",
    "main2_name":         "Main Fabric 2 Name",
    "main2_cm":           "Main Fabric 2 Consumption cm",
    "main2_m":            "Main Fabric 2 Consumption m",
    "lining_name":        "Lining Fabric",
    "lining_cm":          "Lining Consumption cm",
    "lining_m":           "Lining Consumption m",
    "status":             "Style Status",
    "last_updated_by":    "Last Updated By",
    "last_updated_time":  "Last Updated Time",
}


def normalize_mapping_df(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names and clean data in the mapping DataFrame."""
    # Create a case-insensitive lookup map
    lookup = {k.lower(): v for k, v in COLUMN_MAP.items()}
    
    # Rename columns using the map
    rename = {}
    for col in df.columns:
        col_clean = col.strip().lower()
        if col_clean in lookup:
            rename[col] = lookup[col_clean]
    df = df.rename(columns=rename)
    # Remove duplicate columns if both "Status" and "Style Status" were present
    df = df.loc[:, ~df.columns.duplicated()]

    # Ensure required columns exist
    for col in ["fabric_family", "style_name", "main1_name", "main1_cm",
                 "main2_name", "main2_cm", "lining_name", "lining_cm",
                 "status", "last_updated_by", "last_updated_time"]:
        if col not in df.columns:
            df[col] = "" if col.endswith("name") or col.startswith("last_") else ("Active" if col == "status" else 0)

    # Clean up status
    df["status"] = df["status"].astype(str).str.strip().str.capitalize()
    df["status"] = df["status"].replace({"Nan": "Active", "": "Active", "None": "Active"})
    df["status"] = df["status"].fillna("Active")

    # Numeric columns
    for col in ["main1_cm", "main2_cm", "lining_cm"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Standardize fabric names
    for col in ["main1_name", "main2_name", "lining_name"]:
        df[col] = df[col].apply(standardize_fabric_name)

    return df


def denormalize_for_save(df: pd.DataFrame) -> pd.DataFrame:
    """Convert normalized column names back to CSV-friendly names for saving.
    Also ensures CM to M conversion is synced.
    """
    df = df.copy()
    # Ensure Meters columns are synced from Centimeters before saving
    if "main1_cm" in df.columns:
        df["main1_m"] = pd.to_numeric(df["main1_cm"], errors="coerce").fillna(0) / 100.0
    if "main2_cm" in df.columns:
        df["main2_m"] = pd.to_numeric(df["main2_cm"], errors="coerce").fillna(0) / 100.0
    if "lining_cm" in df.columns:
        df["lining_m"] = pd.to_numeric(df["lining_cm"], errors="coerce").fillna(0) / 100.0

    rename = {}
    for col in df.columns:
        if col in SAVE_COLUMN_MAP:
            rename[col] = SAVE_COLUMN_MAP[col]
    return df.rename(columns=rename)


# ═══════════════════════════════════════════════════
# FORECAST
# ═══════════════════════════════════════════════════

def get_14day_avg_forecast(forecast_df: pd.DataFrame, style_family: str) -> Tuple[float, float, float]:
    """Get 14-day average forecast demand for a style family."""
    if forecast_df is None or forecast_df.empty:
        return 0.0, 0.0, 0.0

    keywords = [k.strip().upper() for k in str(style_family).split("/")]
    forecast_df = forecast_df.copy()
    forecast_df["style_upper"] = forecast_df["Fabric_Family_GROUP"].astype(str).str.upper()

    mask = forecast_df["style_upper"].apply(
        lambda x: any(x.split("(")[0].split("-")[0].strip().startswith(k) for k in keywords)
    )

    data = forecast_df[mask]

    if data.empty:
        return 0.0, 0.0, 0.0

    data = data.sort_values("ds")
    daily = data.groupby("ds")[["yhat", "yhat_lower", "yhat_upper"]].sum()
    
    # Clip negative predictions to 0 before taking the mean
    daily["yhat"] = daily["yhat"].clip(lower=0.0)
    daily["yhat_lower"] = daily["yhat_lower"].clip(lower=0.0)
    daily["yhat_upper"] = daily["yhat_upper"].clip(lower=0.0)
    
    first_14 = daily.head(14)

    if first_14.empty:
        return 0.0, 0.0, 0.0

    avg = max(0.0, float(first_14["yhat"].mean()))
    avg_lower = max(0.0, float(first_14["yhat_lower"].mean()))
    avg_upper = max(0.0, float(first_14["yhat_upper"].mean()))

    return avg, avg_lower, avg_upper


# ═══════════════════════════════════════════════════
# FABRIC AGGREGATION — FIXED
# ═══════════════════════════════════════════════════

def get_aggregated_fabrics(mapping_df: pd.DataFrame, style_family: str) -> List[Dict]:
    """Aggregate fabrics for a style family from the NORMALIZED mapping df.
    
    Returns list of dicts: name, role, consumption_cm, ratio (proportion of total consumption)
    """
    rows = mapping_df[
        (mapping_df["fabric_family"].str.strip().str.lower() == str(style_family).strip().lower()) &
        (mapping_df["status"] == "Active")
    ]

    fabric_dict: Dict[str, float] = {}
    fabric_roles: Dict[str, Set[str]] = {}
    fabric_styles: Dict[str, Set[str]] = {}

    for _, row in rows.iterrows():
        style = str(row.get("style_name", ""))

        # Main 1
        name = standardize_fabric_name(row.get("main1_name", ""))
        if name:
            cm = safe_float(row.get("main1_cm", 0))
            fabric_dict[name] = fabric_dict.get(name, 0) + cm
            fabric_roles.setdefault(name, set()).add("Main Fabric")
            fabric_styles.setdefault(name, set()).add(style)

        # Main 2
        name2 = standardize_fabric_name(row.get("main2_name", ""))
        if name2:
            cm = safe_float(row.get("main2_cm", 0))
            fabric_dict[name2] = fabric_dict.get(name2, 0) + cm
            fabric_roles.setdefault(name2, set()).add("Main Fabric")
            fabric_styles.setdefault(name2, set()).add(style)

        # Lining
        lining = standardize_fabric_name(row.get("lining_name", ""))
        if lining:
            cm = safe_float(row.get("lining_cm", 0))
            fabric_dict[lining] = fabric_dict.get(lining, 0) + cm
            fabric_roles.setdefault(lining, set()).add("Lining")
            fabric_styles.setdefault(lining, set()).add(style)

    total_cm = sum(fabric_dict.values())

    results = []
    for name, cm in fabric_dict.items():
        if cm > 0:
            roles_str = " / ".join(sorted(fabric_roles.get(name, set())))
            ratio = cm / total_cm if total_cm > 0 else 0
            results.append({
                "name": name,
                "role": roles_str,
                "consumption_cm": cm,
                "ratio": ratio,  # proportion of total consumption
                "used_in_styles": sorted(fabric_styles.get(name, set())),
            })

    return results


# ═══════════════════════════════════════════════════
# GLOBAL FABRIC DEMAND AGGREGATION
# ═══════════════════════════════════════════════════

def get_global_fabric_demand(mapping_df: pd.DataFrame, forecast_df: pd.DataFrame) -> List[Dict]:
    """Aggregate fabric demand across ALL active styles for procurement planning.
    
    Uses compound key (fabric_family, fabric_name) to prevent cross-collection mixing.
    """
    all_families = mapping_df.loc[mapping_df["status"] == "Active", "fabric_family"].dropna().unique()
    # Key: (family, fabric_name) → prevents cross-family merging
    global_demand: Dict[Tuple[str, str], Dict] = {}

    for family in all_families:
        avg, _, _ = get_14day_avg_forecast(forecast_df, family)
        safe_demand = safe_float(avg, 0.0)
        fabrics = get_aggregated_fabrics(mapping_df, family)

        for fabric in fabrics:
            ratio = fabric["ratio"]
            demand_daily = (safe_demand or 0) * ratio
            demand_14d = demand_daily * 14

            compound_key = (family, fabric["name"])
            if compound_key not in global_demand:
                global_demand[compound_key] = {
                    "demand_daily": 0,
                    "demand_14d": 0,
                    "styles": set(),
                    "roles": set(),
                }
            global_demand[compound_key]["demand_daily"] += demand_daily
            global_demand[compound_key]["demand_14d"] += demand_14d
            global_demand[compound_key]["styles"].update(fabric.get("used_in_styles", []))
            global_demand[compound_key]["roles"].update(fabric.get("role", "").split(" / "))

    rows = []
    for (family, name), data in sorted(global_demand.items(), key=lambda x: -x[1]["demand_14d"]):
        rows.append({
            "fabric": name,
            "fabric_family": family,
            "compound_key": f"{family}::{name}",
            "demand_daily": round(data["demand_daily"], 2),
            "demand_14d": round(data["demand_14d"], 1),
            "used_in_count": len(data["styles"]),
            "used_in_styles": sorted(data["styles"]),
            "role": ", ".join(sorted(r for r in data["roles"] if r)),
        })
    return rows


# ═══════════════════════════════════════════════════
# FABRIC USAGE VISIBILITY
# ═══════════════════════════════════════════════════

def get_fabric_usage(mapping_df: pd.DataFrame, fabric_name: str, family_filter: str = "") -> Dict:
    """Show where a specific fabric is used (which styles, as main or lining).
    
    If family_filter is provided, only shows usage within that collection.
    """
    fabric_lower = standardize_fabric_name(fabric_name)
    if not fabric_lower:
        return {"main_usage": [], "lining_usage": []}

    active = mapping_df[mapping_df["status"] == "Active"]
    if family_filter:
        active = active[active["fabric_family"].str.strip().str.lower() == family_filter.strip().lower()]

    main_usage = []
    lining_usage = []

    for _, row in active.iterrows():
        style = str(row.get("style_name", ""))
        family = str(row.get("fabric_family", ""))

        if standardize_fabric_name(row.get("main1_name", "")) == fabric_lower:
            main_usage.append({"style": style, "family": family, "consumption_cm": safe_float(row.get("main1_cm", 0))})
        if standardize_fabric_name(row.get("main2_name", "")) == fabric_lower:
            main_usage.append({"style": style, "family": family, "consumption_cm": safe_float(row.get("main2_cm", 0))})
        if standardize_fabric_name(row.get("lining_name", "")) == fabric_lower:
            lining_usage.append({"style": style, "family": family, "consumption_cm": safe_float(row.get("lining_cm", 0))})

    return {"main_usage": main_usage, "lining_usage": lining_usage}


# ═══════════════════════════════════════════════════
# INVENTORY CALCULATIONS
# ═══════════════════════════════════════════════════

def calculate_metrics(daily_demand: float, inventory: float, wip_m: float, lead_time: int, buffer_days: int, moq: float = 50.0):
    """Calculate coverage, risk, and reorder for a fabric.
    
    Args:
        daily_demand: Daily fabric demand in meters
        inventory: Current fabric inventory in meters
        wip_m: Work-in-progress in meters (already converted)
        lead_time: Lead time in days
        buffer_days: Safety buffer in days
        moq: Minimum order quantity in meters
    
    Returns:
        tuple: (available, coverage_days, reorder_qty, risk_status)
    """
    available = inventory + wip_m

    if daily_demand <= 0:
        return available, float("inf"), 0.0, "Safe"

    coverage = available / daily_demand
    threshold = lead_time + buffer_days
    
    # Required stock = threshold * daily_demand
    required_stock = threshold * daily_demand
    
    reorder = 0.0
    if available < required_stock:
        shortfall = required_stock - available
        reorder = max(moq, shortfall)

    # Risk classification
    if coverage < threshold:
        risk = "Critical"
    elif coverage < threshold + 3:
        risk = "Warning"
    else:
        risk = "Safe"

    return available, coverage, reorder, risk


# ═══════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════

def validate_style_input(style_name: str, fabric1: str, fabric1_cm: float,
                         fabric2: str, fabric2_cm: float,
                         lining: str, lining_cm: float,
                         existing_styles: list) -> List[str]:
    """Validate style BOM input before saving. Returns list of error messages."""
    errors = []

    if not style_name or not style_name.strip():
        errors.append("Style name is required")

    # At least one fabric required
    has_fabric = False
    if fabric1 and fabric1.strip() and standardize_fabric_name(fabric1):
        has_fabric = True
        if fabric1_cm <= 0:
            errors.append("Main Fabric 1 consumption must be greater than 0")
    if fabric2 and fabric2.strip() and standardize_fabric_name(fabric2):
        has_fabric = True
        if fabric2_cm <= 0:
            errors.append("Main Fabric 2 consumption must be greater than 0")
    if lining and lining.strip() and standardize_fabric_name(lining):
        has_fabric = True
        if lining_cm <= 0:
            errors.append("Lining consumption must be greater than 0")

    if not has_fabric:
        errors.append("At least one fabric with consumption is required")

    # Check for duplicate style name
    if style_name.strip().lower() in [s.strip().lower() for s in existing_styles]:
        errors.append(f"Style '{style_name}' already exists")

    return errors
