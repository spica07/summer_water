# -*- coding: utf-8 -*-
"""facilities_extra.json (전국 조사 데이터, 서울 포함) -> assets/js/data.js 생성

  * facilities_raw.json (서울 xlsx 파이프라인)은 폐지됨. 파일이 남아 있으면 병합하되,
    현재 서울 25개 자치구는 다른 지역과 동일하게 water-researcher 웹 조사로 관리한다.

지오코딩 3단계:
  1) manual   — 한강공원/유명 공원 수동 좌표 (서울 한정, 시설명 부분일치)
  2) geocoded — Nominatim (쿼리 사다리: 주소 → 정제주소 → 지자체+시설명 → 지자체+공원명)
  3) approx   — 지자체 중심 + 결정적 지터 (±약 1.5km)
"""
import colorsys
import json
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")

TOOLS = Path(__file__).resolve().parent
BASE = TOOLS.parent
RAW = TOOLS / "facilities_raw.json"  # (레거시) 서울 xlsx 산출물 — 폐지, 있으면 병합
EXTRA = TOOLS / "facilities_extra.json"  # 전국 조사 에이전트 산출물 (서울 포함)
CACHE_FILE = TOOLS / "geocode_cache.json"
OUT = BASE / "assets" / "js" / "data.js"

# 지역별 허용 범위 (lat_min, lat_max, lng_min, lng_max)
REGION_BOX = {
    "서울": (37.41, 37.72, 126.76, 127.20),
    "경기": (36.85, 38.35, 126.30, 127.90),
    "인천": (37.00, 37.95, 124.50, 126.90),  # 강화·옹진 도서 포함
    "부산": (34.85, 35.40, 128.75, 129.35),
    "대구": (35.60, 36.40, 128.30, 129.05),  # 군위군 포함
    "광주": (35.02, 35.28, 126.63, 127.02),
    "대전": (36.15, 36.52, 127.24, 127.60),
    "울산": (35.30, 35.75, 128.95, 129.50),
    "제주": (33.10, 33.60, 126.10, 127.00),
    "세종": (36.40, 36.75, 127.05, 127.45),
    "강원": (36.95, 38.65, 127.05, 129.40),
    "충북": (36.00, 37.30, 127.25, 128.70),
    "충남": (35.95, 37.10, 125.90, 127.60),
    "전북": (35.25, 36.20, 126.35, 127.95),
    "전남": (33.80, 35.55, 125.05, 127.95),
    "경북": (35.55, 37.60, 127.75, 131.00),  # 울릉·독도 포함
    "경남": (34.45, 35.95, 127.55, 129.30),
}

SEOUL_CENTERS = {
    "종로구": (37.5735, 126.9790), "중구": (37.5641, 126.9979), "용산구": (37.5324, 126.9900),
    "성동구": (37.5634, 127.0369), "광진구": (37.5385, 127.0823), "동대문구": (37.5744, 127.0396),
    "중랑구": (37.6063, 127.0927), "성북구": (37.5894, 127.0167), "강북구": (37.6396, 127.0257),
    "도봉구": (37.6688, 127.0471), "노원구": (37.6542, 127.0568), "은평구": (37.6027, 126.9291),
    "서대문구": (37.5791, 126.9368), "마포구": (37.5663, 126.9019), "양천구": (37.5170, 126.8664),
    "강서구": (37.5509, 126.8495), "구로구": (37.4954, 126.8874), "금천구": (37.4569, 126.8955),
    "영등포구": (37.5264, 126.8962), "동작구": (37.5124, 126.9393), "관악구": (37.4784, 126.9516),
    "서초구": (37.4837, 127.0324), "강남구": (37.5172, 127.0473), "송파구": (37.5145, 127.1059),
    "강동구": (37.5301, 127.1237),
}

GYEONGGI_CENTERS = {
    "수원시": (37.2636, 127.0286), "성남시": (37.4200, 127.1267), "고양시": (37.6584, 126.8320),
    "용인시": (37.2411, 127.1776), "부천시": (37.5035, 126.7660), "안산시": (37.3219, 126.8309),
    "안양시": (37.3943, 126.9568), "남양주시": (37.6360, 127.2165), "화성시": (37.1995, 126.8315),
    "평택시": (36.9921, 127.1129), "의정부시": (37.7381, 127.0338), "시흥시": (37.3800, 126.8029),
    "파주시": (37.7600, 126.7800), "김포시": (37.6153, 126.7156), "광명시": (37.4786, 126.8644),
    "광주시": (37.4295, 127.2550), "군포시": (37.3617, 126.9352), "하남시": (37.5393, 127.2148),
    "오산시": (37.1499, 127.0774), "이천시": (37.2724, 127.4350), "안성시": (37.0080, 127.2797),
    "의왕시": (37.3448, 126.9683), "양주시": (37.7852, 127.0459), "구리시": (37.5943, 127.1296),
    "포천시": (37.8949, 127.2002), "여주시": (37.2984, 127.6370), "동두천시": (37.9036, 127.0605),
    "과천시": (37.4292, 126.9876), "가평군": (37.8315, 127.5105), "양평군": (37.4917, 127.4875),
    "연천군": (38.0966, 127.0749),
}

INCHEON_CENTERS = {
    "인천 중구": (37.4738, 126.6216), "인천 동구": (37.4739, 126.6432), "인천 미추홀구": (37.4635, 126.6503),
    "인천 연수구": (37.4102, 126.6784), "인천 남동구": (37.4470, 126.7312), "인천 부평구": (37.5070, 126.7219),
    "인천 계양구": (37.5372, 126.7376), "인천 서구": (37.5456, 126.6760), "인천 강화군": (37.7467, 126.4880),
    "인천 옹진군": (37.2590, 126.4750),
}

BUSAN_CENTERS = {
    "부산 중구": (35.1064, 129.0324), "부산 서구": (35.0979, 129.0243), "부산 동구": (35.1294, 129.0454),
    "부산 영도구": (35.0911, 129.0679), "부산 부산진구": (35.1631, 129.0532), "부산 동래구": (35.2049, 129.0837),
    "부산 남구": (35.1366, 129.0843), "부산 북구": (35.1972, 128.9903), "부산 해운대구": (35.1631, 129.1635),
    "부산 사하구": (35.1046, 128.9749), "부산 금정구": (35.2429, 129.0922), "부산 강서구": (35.2122, 128.9807),
    "부산 연제구": (35.1762, 129.0799), "부산 수영구": (35.1455, 129.1131), "부산 사상구": (35.1526, 128.9909),
    "부산 기장군": (35.2446, 129.2222),
}

DAEGU_CENTERS = {
    "대구 중구": (35.8694, 128.6062), "대구 동구": (35.8867, 128.6357), "대구 서구": (35.8719, 128.5591),
    "대구 남구": (35.8460, 128.5977), "대구 북구": (35.8858, 128.5828), "대구 수성구": (35.8582, 128.6306),
    "대구 달서구": (35.8299, 128.5326), "대구 달성군": (35.7746, 128.4314), "대구 군위군": (36.2428, 128.5728),
}

GWANGJU_CENTERS = {
    "광주 동구": (35.1461, 126.9232), "광주 서구": (35.1518, 126.8903), "광주 남구": (35.1330, 126.9026),
    "광주 북구": (35.1740, 126.9120), "광주 광산구": (35.1396, 126.7937),
}

DAEJEON_CENTERS = {
    "대전 동구": (36.3120, 127.4548), "대전 중구": (36.3255, 127.4213), "대전 서구": (36.3554, 127.3838),
    "대전 유성구": (36.3624, 127.3562), "대전 대덕구": (36.3466, 127.4156),
}

ULSAN_CENTERS = {
    "울산 중구": (35.5694, 129.3326), "울산 남구": (35.5439, 129.3300), "울산 동구": (35.5049, 129.4166),
    "울산 북구": (35.5827, 129.3612), "울산 울주군": (35.5622, 129.2432),
}

JEJU_CENTERS = {
    "제주시": (33.4996, 126.5312), "서귀포시": (33.2541, 126.5600),
}

SEJONG_CENTERS = {
    "세종시": (36.4800, 127.2890),
}

GANGWON_CENTERS = {
    "춘천시": (37.8813, 127.7298), "원주시": (37.3422, 127.9202), "강릉시": (37.7519, 128.8761),
    "동해시": (37.5247, 129.1143), "태백시": (37.1640, 128.9856), "속초시": (38.2070, 128.5918),
    "삼척시": (37.4499, 129.1652), "홍천군": (37.6971, 127.8888), "횡성군": (37.4917, 127.9853),
    "영월군": (37.1836, 128.4617), "평창군": (37.3708, 128.3903), "정선군": (37.3807, 128.6608),
    "철원군": (38.1468, 127.3132), "화천군": (38.1063, 127.7082), "양구군": (38.1100, 127.9899),
    "인제군": (38.0695, 128.1707), "강원 고성군": (38.3806, 128.4678), "양양군": (38.0754, 128.6190),
}

CHUNGBUK_CENTERS = {
    "청주시": (36.6424, 127.4890), "충주시": (36.9910, 127.9260), "제천시": (37.1326, 128.1910),
    "보은군": (36.4894, 127.7295), "옥천군": (36.3064, 127.5715), "영동군": (36.1750, 127.7764),
    "증평군": (36.7852, 127.5814), "진천군": (36.8554, 127.4356), "괴산군": (36.8153, 127.7867),
    "음성군": (36.9403, 127.6906), "단양군": (36.9846, 128.3655),
}

CHUNGNAM_CENTERS = {
    "천안시": (36.8151, 127.1139), "공주시": (36.4466, 127.1190), "보령시": (36.3333, 126.6127),
    "아산시": (36.7898, 127.0018), "서산시": (36.7848, 126.4503), "논산시": (36.1872, 127.0986),
    "계룡시": (36.2745, 127.2489), "당진시": (36.8897, 126.6459), "금산군": (36.1088, 127.4881),
    "부여군": (36.2757, 126.9098), "서천군": (36.0803, 126.6919), "청양군": (36.4592, 126.8024),
    "홍성군": (36.6012, 126.6608), "예산군": (36.6826, 126.8449), "태안군": (36.7456, 126.2979),
}

JEONBUK_CENTERS = {
    "전주시": (35.8242, 127.1480), "군산시": (35.9676, 126.7366), "익산시": (35.9483, 126.9577),
    "정읍시": (35.5699, 126.8559), "남원시": (35.4164, 127.3905), "김제시": (35.8036, 126.8809),
    "완주군": (35.9046, 127.1622), "진안군": (35.7917, 127.4249), "무주군": (36.0068, 127.6608),
    "장수군": (35.6474, 127.5211), "임실군": (35.6178, 127.2891), "순창군": (35.3744, 127.1374),
    "고창군": (35.4358, 126.7020), "부안군": (35.7317, 126.7336),
}

JEONNAM_CENTERS = {
    "목포시": (34.8118, 126.3922), "여수시": (34.7604, 127.6622), "순천시": (34.9507, 127.4872),
    "나주시": (35.0159, 126.7108), "광양시": (34.9407, 127.6959), "담양군": (35.3211, 126.9882),
    "곡성군": (35.2820, 127.2920), "구례군": (35.2025, 127.4629), "고흥군": (34.6111, 127.2850),
    "보성군": (34.7714, 127.0800), "화순군": (35.0645, 126.9866), "장흥군": (34.6816, 126.9070),
    "강진군": (34.6420, 126.7672), "해남군": (34.5734, 126.5992), "영암군": (34.8001, 126.6968),
    "무안군": (34.9903, 126.4816), "함평군": (35.0659, 126.5165), "영광군": (35.2772, 126.5120),
    "장성군": (35.3018, 126.7847), "완도군": (34.3110, 126.7550), "진도군": (34.4868, 126.2635),
    "신안군": (34.8335, 126.3517),
}

GYEONGBUK_CENTERS = {
    "포항시": (36.0190, 129.3435), "경주시": (35.8562, 129.2247), "김천시": (36.1398, 128.1136),
    "안동시": (36.5684, 128.7294), "구미시": (36.1195, 128.3446), "영주시": (36.8057, 128.6240),
    "영천시": (35.9733, 128.9386), "상주시": (36.4109, 128.1590), "문경시": (36.5866, 128.1867),
    "경산시": (35.8251, 128.7411), "의성군": (36.3527, 128.6970), "청송군": (36.4360, 129.0572),
    "영양군": (36.6667, 129.1124), "영덕군": (36.4150, 129.3654), "청도군": (35.6474, 128.7340),
    "고령군": (35.7261, 128.2629), "성주군": (35.9192, 128.2829), "칠곡군": (35.9955, 128.4018),
    "예천군": (36.6579, 128.4530), "봉화군": (36.8931, 128.7325), "울진군": (36.9930, 129.4004),
    "울릉군": (37.4844, 130.9058),
}

GYEONGNAM_CENTERS = {
    "창원시": (35.2280, 128.6811), "진주시": (35.1800, 128.1076), "통영시": (34.8544, 128.4332),
    "사천시": (35.0037, 128.0644), "김해시": (35.2286, 128.8894), "밀양시": (35.5038, 128.7467),
    "거제시": (34.8806, 128.6211), "양산시": (35.3350, 129.0372), "의령군": (35.3222, 128.2617),
    "함안군": (35.2724, 128.4065), "창녕군": (35.5444, 128.4924), "경남 고성군": (34.9730, 128.3222),
    "남해군": (34.8376, 127.8924), "하동군": (35.0674, 127.7513), "산청군": (35.4155, 127.8734),
    "함양군": (35.5205, 127.7251), "거창군": (35.6867, 127.9095), "합천군": (35.5666, 128.1658),
}

DISTRICT_CENTERS = {**SEOUL_CENTERS, **GYEONGGI_CENTERS, **INCHEON_CENTERS,
                    **BUSAN_CENTERS, **DAEGU_CENTERS, **GWANGJU_CENTERS,
                    **DAEJEON_CENTERS, **ULSAN_CENTERS, **JEJU_CENTERS,
                    **SEJONG_CENTERS, **GANGWON_CENTERS, **CHUNGBUK_CENTERS,
                    **CHUNGNAM_CENTERS, **JEONBUK_CENTERS, **JEONNAM_CENTERS,
                    **GYEONGBUK_CENTERS, **GYEONGNAM_CENTERS}
DISTRICT_REGION = {
    **{d: "서울" for d in SEOUL_CENTERS},
    **{d: "경기" for d in GYEONGGI_CENTERS},
    **{d: "인천" for d in INCHEON_CENTERS},
    **{d: "부산" for d in BUSAN_CENTERS},
    **{d: "대구" for d in DAEGU_CENTERS},
    **{d: "광주" for d in GWANGJU_CENTERS},
    **{d: "대전" for d in DAEJEON_CENTERS},
    **{d: "울산" for d in ULSAN_CENTERS},
    **{d: "제주" for d in JEJU_CENTERS},
    **{d: "세종" for d in SEJONG_CENTERS},
    **{d: "강원" for d in GANGWON_CENTERS},
    **{d: "충북" for d in CHUNGBUK_CENTERS},
    **{d: "충남" for d in CHUNGNAM_CENTERS},
    **{d: "전북" for d in JEONBUK_CENTERS},
    **{d: "전남" for d in JEONNAM_CENTERS},
    **{d: "경북" for d in GYEONGBUK_CENTERS},
    **{d: "경남" for d in GYEONGNAM_CENTERS},
}

# 시설명 부분일치 -> 좌표 (한강공원 + 대형 공원)
MANUAL_COORDS = {
    "뚝섬한강공원": (37.5297, 127.0669), "여의도한강공원": (37.5266, 126.9345),
    "광나루한강공원": (37.5493, 127.1204), "잠원한강공원": (37.5205, 127.0113),
    "잠실한강공원": (37.5178, 127.0817), "망원한강공원": (37.5544, 126.8956),
    "양화한강공원": (37.5375, 126.8985), "난지한강공원": (37.5665, 126.8752),
    "이촌한강공원": (37.5170, 126.9713), "서울숲": (37.5444, 127.0374),
    "어린이대공원": (37.5481, 127.0740), "보라매공원": (37.4934, 126.9195),
    "월드컵공원": (37.5652, 126.8973), "평화의공원": (37.5652, 126.8973),
    "북서울꿈의숲": (37.6206, 127.0416), "서울식물원": (37.5694, 126.8350),
    "중랑캠핑숲": (37.6112, 127.1051), "문화비축기지": (37.5666, 126.8934),
    "서서울호수공원": (37.5237, 126.8339), "용산가족공원": (37.5219, 126.9829),
    "여의도공원": (37.5254, 126.9231), "응봉근린공원": (37.5522, 127.0312),
}

cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}

session = requests.Session()
session.headers["User-Agent"] = "summer-water-map/1.0"

def in_region(lat, lng, region):
    box = REGION_BOX.get(region, REGION_BOX["서울"])
    return box[0] <= lat <= box[1] and box[2] <= lng <= box[3]

def nominatim(query, region):
    cache_key = query if region == "서울" else f"{region}|{query}"  # 기존 서울 캐시 호환
    if cache_key in cache:
        return cache[cache_key]
    try:
        r = session.get(
            "https://nominatim.openstreetmap.org/search",
            params={"format": "json", "q": query, "countrycodes": "kr",
                    "accept-language": "ko", "limit": 3},
            timeout=15,
        )
        r.raise_for_status()
        results = [
            {"lat": float(x["lat"]), "lng": float(x["lon"])}
            for x in r.json()
            if in_region(float(x["lat"]), float(x["lon"]), region)
        ]
    except Exception as e:
        print(f"  ! request failed for {query!r}: {e}")
        results = None  # 실패는 캐시하지 않음
    if results is not None:
        cache[cache_key] = results
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    time.sleep(1.1)
    return results or []

def clean_address(addr):
    a = re.sub(r"\(.*?\)", "", addr)
    a = re.sub(r"(내|일대|앞|옆|인근|부근)\s*$", "", a.strip())
    return a.strip()

def park_name(name):
    m = re.search(r"([가-힣0-9]+(?:공원|놀이터|광장|천|숲))", name)
    return m.group(1) if m else None

def geocode_one(f):
    name, district, addr = f["name"] or "", f["district"] or "", f["address"] or ""
    region = f.get("region") or DISTRICT_REGION.get(district, "서울")
    # 지오코딩 쿼리용 접두사: "서울" / "경기도" / "인천" (인천 구명엔 이미 "인천 " 포함)
    prefix = {"서울": "서울", "경기": "경기도", "인천": ""}.get(region, "")
    dq = district  # 쿼리용 지자체명
    # 1) manual (서울 한정 — 타 지역 시설명 오매칭 방지)
    if region == "서울":
        for key, coord in MANUAL_COORDS.items():
            if key in name or (addr and key in addr):
                return coord[0], coord[1], "manual"
    # 2) nominatim ladder
    queries = []
    if addr:
        full = addr if prefix == "" or prefix in addr else f"{prefix} {addr}"
        queries.append(full)
        ca = clean_address(addr)
        if ca and ca != addr:
            queries.append(ca if prefix == "" or prefix in ca else f"{prefix} {ca}")
    queries.append(f"{prefix} {dq} {name}".strip())
    pk = park_name(name)
    if pk and pk != name:
        queries.append(f"{prefix} {dq} {pk}".strip())
    seen = set()
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        results = nominatim(q, region)
        if results:
            return results[0]["lat"], results[0]["lng"], "geocoded"
    # 3) district jitter (결정적)
    clat, clng = DISTRICT_CENTERS.get(district, (37.5665, 126.9780))
    jlat = ((f["id"] * 37) % 100 - 50) * 0.00028
    jlng = ((f["id"] * 61) % 100 - 50) * 0.00034
    return round(clat + jlat, 6), round(clng + jlng, 6), "approx"

def district_colors():
    """모든 지자체(서울+경기+인천)에 파스텔-비비드 색상을 결정적으로 배정"""
    names = sorted(DISTRICT_CENTERS.keys())
    colors = {}
    for i, d in enumerate(names):
        h = (i * 360 / len(names) + 340) % 360 / 360
        r, g, b = colorsys.hls_to_rgb(h, 0.58, 0.72)
        colors[d] = "#{:02X}{:02X}{:02X}".format(int(r * 255), int(g * 255), int(b * 255))
    return colors

def parse_period(p):
    """'2026.07.01~08.24' 류 문자열에서 (periodStart, periodEnd) ISO 날짜 추출"""
    if not p:
        return None, None
    m = re.search(
        r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[~\-–]\s*(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})", p)
    if m:
        y1, mo1, d1, y2, mo2, d2 = m.groups()
        return (f"{y1}-{int(mo1):02d}-{int(d1):02d}",
                f"{y2 or y1}-{int(mo2):02d}-{int(d2):02d}")
    m = re.search(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", p)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}", None
    return None, None

def main():
    facilities = []
    summary = {}
    # (레거시) 서울 xlsx 산출물이 남아 있으면 병합 — 현재는 서울도 EXTRA로 관리
    if RAW.exists():
        data = json.loads(RAW.read_text(encoding="utf-8"))
        facilities = data.get("facilities", [])
        summary = data.get("summary", {})
        for f in facilities:
            f.setdefault("region", "서울")

    # 전국 조사 데이터 병합 (서울 포함, id 200번대부터 — 레거시 raw id와 충돌 방지)
    if EXTRA.exists():
        extra = json.loads(EXTRA.read_text(encoding="utf-8"))["facilities"]
        next_id = 200
        for f in extra:
            f["id"] = next_id
            next_id += 1
            f.setdefault("region", DISTRICT_REGION.get(f.get("district"), "경기"))
            f.setdefault("typeRaw", f.get("type"))
            f.setdefault("statusRaw", f.get("status"))
            ps, pe = parse_period(f.get("period"))
            f.setdefault("periodStart", ps)
            f.setdefault("periodEnd", pe)
            if f.get("district") not in DISTRICT_CENTERS:
                print(f"  ! 알 수 없는 지자체: {f.get('district')} ({f.get('name')})")
        facilities += extra
        print(f"extra: 전국 {len(extra)}개 시설 병합")

    tiers = {"manual": 0, "geocoded": 0, "approx": 0}
    for f in facilities:
        lat, lng, geo = geocode_one(f)
        f["lat"], f["lng"], f["geo"] = round(lat, 6), round(lng, 6), geo
        tiers[geo] += 1
        print(f"[{geo:8s}] {f['district']} {f['name']}")

    colors = district_colors()
    district_meta = {
        d: {"lat": c[0], "lng": c[1], "color": colors[d], "region": DISTRICT_REGION[d]}
        for d, c in DISTRICT_CENTERS.items()
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    js = (
        "// 자동 생성 파일 — tools/geocode.py 가 생성. 직접 수정하지 마세요.\n"
        "window.DISTRICT_META = "
        + json.dumps(district_meta, ensure_ascii=False)
        + ";\nwindow.FACILITIES = "
        + json.dumps(facilities, ensure_ascii=False)
        + ";\nwindow.DISTRICT_SUMMARY = "
        + json.dumps(summary, ensure_ascii=False)
        + ";\nwindow.DATA_META = "
        + json.dumps({"surveyDate": "2026-07-07", "total": len(facilities)}, ensure_ascii=False)
        + ";\n"
    )
    OUT.write_text(js, encoding="utf-8")
    print(f"\ndone. tiers: {tiers}")
    print(f"wrote {OUT}")

if __name__ == "__main__":
    main()
