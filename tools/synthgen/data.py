"""Static pools of realistic Indian land-record field values."""

from __future__ import annotations

import random

# ---------------------------------------------------------------------------
# Locale-aware name pools
# ---------------------------------------------------------------------------

NAMES_HI = [
    "राम कुमार", "सीता देवी", "मोहन लाल", "सुनीता बाई", "रामेश्वर प्रसाद",
    "गीता शर्मा", "विजय कुमार", "पुष्पा देवी", "महेश यादव", "कमला देवी",
    "अर्जुन सिंह", "शांति देवी", "हरि राम", "उर्मिला देवी", "जगदीश प्रसाद",
]
NAMES_KN = [
    "ರಾಮಕೃಷ್ಣ", "ಸರಸ್ವತಿ", "ವೆಂಕಟೇಶ", "ಲಕ್ಷ್ಮಿ", "ನಾರಾಯಣ",
    "ಪದ್ಮಾ", "ಶಿವರಾಜ್", "ಮಂಜುಳ", "ಕೃಷ್ಣಮೂರ್ತಿ", "ಸೌಮ್ಯ",
]
NAMES_TE = [
    "రామారావు", "సీతాదేవి", "వెంకటేశ్వర్లు", "లక్ష్మి", "నాగేశ్వరరావు",
    "పద్మావతి", "శ్రీనివాస్", "మంజుల", "కృష్ణమూర్తి", "సావిత్రి",
]
NAMES_TA = [
    "ராமசாமி", "கமலா", "முருகன்", "செல்வி", "சுப்பிரமணியம்",
    "லலிதா", "வேலுசாமி", "ஜோதி", "கார்த்திகேயன்", "சரஸ்வதி",
]
NAMES_PA = [
    "ਰਾਜਿੰਦਰ ਸਿੰਘ", "ਕਿਰਨ ਕੌਰ", "ਗੁਰਦੀਪ ਸਿੰਘ", "ਸੁਰਜੀਤ ਕੌਰ", "ਹਰਦੇਵ ਸਿੰਘ",
    "ਅਮਰਜੀਤ ਕੌਰ", "ਬਲਵਿੰਦਰ ਸਿੰਘ", "ਪਰਮਜੀਤ ਕੌਰ", "ਜਸਵੰਤ ਸਿੰਘ", "ਨਵਜੋਤ ਕੌਰ",
]
NAMES_MR = [
    "रामचंद्र पाटील", "सुनंदा देसाई", "विठ्ठल शिंदे", "मंगल कदम", "बाळासाहेब जाधव",
    "कमलाबाई मोरे", "संदीप चव्हाण", "वंदना साळुंखे", "प्रकाश भोसले", "उषा निंबाळकर",
]
NAMES_EN = [
    "Ramesh Kumar", "Sunita Devi", "Mohan Lal", "Pushpa Bai", "Vijay Singh",
    "Geeta Sharma", "Harish Yadav", "Kamala Devi", "Arjun Patel", "Shanti Bai",
]

NAMES_BY_LANG: dict[str, list[str]] = {
    "hi": NAMES_HI,
    "kn": NAMES_KN,
    "te": NAMES_TE,
    "ta": NAMES_TA,
    "pa": NAMES_PA,
    "mr": NAMES_MR,
    "en": NAMES_EN,
}

RELATIONS = ["S/o", "D/o", "W/o", "s/o", "d/o", "w/o"]

LAND_TYPES = ["Agricultural", "Residential", "Commercial", "Wasteland", "Forest", "Common Land", "Orchard", "Irrigated"]
SOIL_TYPES = ["Black Cotton", "Red Laterite", "Alluvial", "Sandy Loam", "Clay", "Loam"]
IRRIGATION = ["Canal", "Tubewell", "Rainfed", "Borewell", "Tank", "River Lift"]

STATES_DISTRICTS: dict[str, list[tuple[str, list[str]]]] = {
    "hi": [
        ("Rajasthan", ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"]),
        ("Uttar Pradesh", ["Lucknow", "Agra", "Varanasi", "Kanpur", "Prayagraj"]),
        ("Madhya Pradesh", ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain"]),
        ("Bihar", ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "Darbhanga"]),
        ("Haryana", ["Gurugram", "Faridabad", "Rohtak", "Ambala", "Karnal"]),
    ],
    "kn": [("Karnataka", ["Bengaluru", "Mysuru", "Tumkur", "Dharwad", "Belagavi"])],
    "te": [("Andhra Pradesh", ["Guntur", "Vijayawada", "Visakhapatnam", "Tirupati", "Kakinada"]),
           ("Telangana", ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"])],
    "ta": [("Tamil Nadu", ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"])],
    "pa": [("Punjab", ["Amritsar", "Ludhiana", "Jalandhar", "Patiala", "Bathinda"])],
    "mr": [("Maharashtra", ["Mumbai", "Pune", "Nashik", "Aurangabad", "Nagpur"])],
}

DOC_TYPES = ["PATTA", "KHATAUNI", "RTC", "BHU_ABHILEKH", "FARD", "JAMABANDI"]


def random_name(lang: str = "hi") -> str:
    pool = NAMES_BY_LANG.get(lang, NAMES_EN)
    return random.choice(pool)


def random_location(lang: str = "hi") -> tuple[str, str, str, str]:
    """Returns (state, district, tehsil, village)."""
    options = STATES_DISTRICTS.get(lang, STATES_DISTRICTS["hi"])
    state, districts = random.choice(options)
    district = random.choice(districts)
    tehsil = district + " Tehsil"
    village = random.choice([
        "Rampur", "Krishnapur", "Ganeshpur", "Lakshmipur", "Indrapur",
        "Shivapur", "Anandpur", "Sundarpur", "Vijaypur", "Santoshpur",
    ])
    return state, district, tehsil, village


def random_survey_number() -> str:
    variants = [
        lambda: str(random.randint(1, 999)),
        lambda: f"{random.randint(1, 500)}/{random.randint(1, 9)}",
        lambda: f"{random.randint(1, 500)}/{random.choice('ABCD')}",
        lambda: f"{random.randint(1, 200)}/{random.randint(1, 5)}/{random.randint(1, 3)}",
    ]
    return random.choice(variants)()


def random_area() -> tuple[float, str]:
    unit = random.choice(["Bigha", "Biswa", "Acre", "Hectare", "Guntha", "Cent", "Are"])
    area = round(random.uniform(0.1, 25.0), 3)
    return area, unit


def random_date(year_range: tuple[int, int] = (1990, 2025)) -> str:
    import datetime
    year = random.randint(*year_range)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return datetime.date(year, month, day).strftime("%d/%m/%Y")


def random_mutation_number() -> str:
    return f"MUT/{random.randint(2010, 2025)}/{random.randint(1000, 99999)}"
