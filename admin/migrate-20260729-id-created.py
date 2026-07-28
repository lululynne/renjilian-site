#!/usr/bin/env python3
"""一次性迁移（可重跑）：给 data/questions.json 每张卡补稳定 id 与 created_at。
- 保持卡的顺序与其余内容不变，只补缺失字段
- 已有 id 的卡绝不动（重跑幂等，不会重复加 id）
- 缺 created_at 的老卡回填为迁移时刻，并加 created_at_note 注明
- 顺手归一化 tags：去前导 #、去首尾空格、去空、同卡去重（修掉手打 # 落库的脏标签）
- 迁移前原样备份 questions.json.bak-migrate-20260729（已存在则不覆盖）
回滚：cp data/questions.json.bak-migrate-20260729 data/questions.json
"""
import json, os, secrets, sys
from datetime import datetime, timezone, timedelta

SITE = os.path.expanduser("~/renjilian-site")
DATA = os.path.join(SITE, "data", "questions.json")
BACKUP = DATA + ".bak-migrate-20260729"
NOW = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
NOTE = "2026-07-29 迁移回填（原卡无此字段）"

def clean_tags(tags):
    out, seen = [], set()
    for t in tags if isinstance(tags, list) else []:
        t = str(t).strip().lstrip("#").strip()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out

def main():
    qs = json.load(open(DATA))
    if not isinstance(qs, list):
        sys.exit("questions.json 不是数组，停手")
    if not os.path.exists(BACKUP):
        with open(BACKUP, "w") as f:
            json.dump(qs, f, ensure_ascii=False, indent=2)
        print("已备份 →", BACKUP)
    else:
        print("备份已存在，不覆盖：", BACKUP)

    used = {q.get("id") for q in qs if isinstance(q, dict) and q.get("id")}
    n_id = n_ts = n_tag = 0
    for i, q in enumerate(qs):
        if not q.get("id"):
            while True:
                nid = "q-20260729-%02d-%s" % (i, secrets.token_hex(2))
                if nid not in used:
                    break
            used.add(nid)
            q["id"] = nid
            n_id += 1
        if not q.get("created_at"):
            q["created_at"] = NOW
            q["created_at_note"] = NOTE
            n_ts += 1
        cleaned = clean_tags(q.get("tags"))
        if cleaned != q.get("tags", []):
            q["tags"] = cleaned
            n_tag += 1

    json.dump(qs, open(DATA, "w"), ensure_ascii=False, indent=2)
    print("补 id：%d 张 · 补 created_at：%d 张 · 清洗 tags：%d 张 · 共 %d 张"
          % (n_id, n_ts, n_tag, len(qs)))

if __name__ == "__main__":
    main()
