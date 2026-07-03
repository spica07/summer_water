# -*- coding: utf-8 -*-
"""조사 결과 -> tools/facilities_extra.json 병합/업데이트

사용법:
    py -3 tools/merge_extra.py <입력파일...>

입력 파일 형식 (자동 감지):
  1) JSON 배열: [{"municipality": "...", "region": "...", "facilities": [...]}, ...]
  2) JSONL transcript: 조사 에이전트 출력(.output) — 마지막 assistant 텍스트에서 배열 추출
  3) JSON dict: {"facilities": [...]} — 평탄화된 시설 목록 (facilities_extra.json 형식)

동작:
  - 기존 facilities_extra.json이 있으면 그것을 기준으로 시작한다.
  - 입력에 등장한 지자체(municipality/district)는 해당 지자체의 기존 시설을 전부
    새 조사 결과로 교체한다 (재조사 = 업데이트). 새 지자체는 추가.
  - 시설이 빈 배열인 지자체는 "조사했으나 시설 없음"으로 간주해 기존 항목을 제거한다.
"""
import html
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

TOOLS = Path(__file__).resolve().parent
OUT = TOOLS / "facilities_extra.json"

INPUT_FILES = [Path(p) for p in sys.argv[1:]]


def last_result_text(fp: Path):
    """transcript에서 '"municipality"'를 포함한 마지막 assistant 텍스트 반환"""
    best = None
    for line in fp.read_text(encoding="utf-8").splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg = obj.get("message") or {}
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content")
        texts = [content] if isinstance(content, str) else [
            b.get("text", "") for b in (content or [])
            if isinstance(b, dict) and b.get("type") == "text"
        ]
        for t in texts:
            if '"municipality"' in t:
                best = t
    return best


def load_groups(fp: Path):
    """파일에서 [{municipality, region, facilities}] 목록 추출"""
    raw = fp.read_text(encoding="utf-8").lstrip()
    if raw.startswith("["):
        return json.loads(raw)
    # dict 형식 시도 (facilities_extra.json) — 전체 파싱 실패 시 JSONL transcript로 처리
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and "facilities" in data:
            groups = {}
            for f in data["facilities"]:
                g = groups.setdefault(f["district"], {
                    "municipality": f["district"], "region": f.get("region"),
                    "facilities": []})
                g["facilities"].append(f)
            return list(groups.values())
    except json.JSONDecodeError:
        pass
    text = last_result_text(fp)
    if not text:
        print(f"! {fp.name}: 결과 텍스트 없음")
        return []
    start = text.index("[")
    arr, _ = json.JSONDecoder().raw_decode(text[start:])
    return arr


def main():
    # 기존 데이터를 지자체별로 적재 (등장 순서 유지)
    merged = {}  # municipality -> {"region": ..., "facilities": [...]}
    if OUT.exists():
        for g in load_groups(OUT):
            merged[g["municipality"]] = {"region": g.get("region"),
                                         "facilities": g["facilities"]}
        print(f"기존: 지자체 {len(merged)}개, 시설 "
              f"{sum(len(v['facilities']) for v in merged.values())}개")

    for fp in INPUT_FILES:
        groups = load_groups(fp)
        n = sum(len(g.get("facilities", [])) for g in groups)
        print(f"{fp.name}: 지자체 {len(groups)}개, 시설 {n}개")
        for g in groups:
            muni = g["municipality"]
            if muni in merged and merged[muni]["facilities"]:
                print(f"  ~ 교체: {muni} "
                      f"({len(merged[muni]['facilities'])} -> {len(g.get('facilities', []))}개)")
            merged[muni] = {"region": g.get("region"),
                            "facilities": g.get("facilities", [])}

    facilities = []
    seen = set()
    for muni, v in merged.items():
        for f in v["facilities"]:
            f["district"] = muni
            f["region"] = v["region"] or f.get("region")
            if f.get("sourceUrl"):
                f["sourceUrl"] = html.unescape(f["sourceUrl"])
            key = (f["district"], f["name"])
            if key in seen:
                print(f"  ! 중복 제외: {key}")
                continue
            seen.add(key)
            facilities.append(f)

    OUT.write_text(json.dumps({"facilities": facilities}, ensure_ascii=False, indent=2),
                   encoding="utf-8")
    by_region = {}
    for f in facilities:
        by_region[f["region"]] = by_region.get(f["region"], 0) + 1
    print(f"\n총 {len(facilities)}개 시설 -> {OUT}")
    print(f"지역별: {by_region}")


if __name__ == "__main__":
    main()
