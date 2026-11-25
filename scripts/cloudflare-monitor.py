#!/usr/bin/env python3
"""Read-only Cloudflare monitor. Never emit raw API responses or credentials."""
import datetime as dt
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

UUID = r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
SHA = r"[0-9a-fA-F]{40}"
TIME = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})"

def match(value, pattern):
    return value if isinstance(value, str) and re.fullmatch(pattern, value) else None

def enum(value, choices):
    return value if isinstance(value, str) and value in choices else None

def obj(value):
    return value if isinstance(value, dict) else {}

def records(value, field):
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and isinstance(value.get(field), list):
        return value[field]
    raise MonitorError("unexpected_response_shape")

class MonitorError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def api_reader(account, token):
    opener = urllib.request.build_opener(NoRedirect())
    def get(path, query=None):
        url = "https://api.cloudflare.com/client/v4/accounts/" + account + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        req = urllib.request.Request(url, headers={
            "Authorization": "Bearer " + token, "Accept": "application/json"
        }, method="GET")
        try:
            with opener.open(req, timeout=15) as resp:
                payload = json.loads(resp.read(8_000_001))
        except urllib.error.HTTPError as exc:
            raise MonitorError("http_" + str(exc.code)) from None
        except (OSError, ValueError):
            raise MonitorError("network_or_invalid_json") from None
        if not isinstance(payload, dict) or payload.get("success") is not True:
            raise MonitorError("cloudflare_api_error")
        return payload.get("result")
    return get

def safe_build(raw):
    raw = obj(raw)
    meta = obj(raw.get("build_trigger_metadata"))
    branch = meta.get("branch")
    return {
        "build_id": match(raw.get("build_uuid"), UUID),
        "branch": "main" if branch == "main" else ("other" if branch else None),
        "commit_sha": match(meta.get("commit_hash"), SHA),
        "status": enum(raw.get("status"), ("queued", "initializing", "running", "stopped")),
        "outcome": enum(raw.get("build_outcome"), ("success", "fail", "skipped", "cancelled", "terminated")),
        "created_at": match(raw.get("created_on"), TIME),
        "started_at": match(raw.get("running_on"), TIME),
        "finished_at": match(raw.get("stopped_on"), TIME),
    }

def safe_deployment(raw):
    raw = obj(raw)
    versions = []
    for value in raw.get("versions") or []:
        v = obj(value)
        vid = match(v.get("version_id"), UUID)
        pct = v.get("percentage")
        if vid and type(pct) in (int, float) and math.isfinite(pct) and 0 <= pct <= 100:
            versions.append({"version_id": vid, "traffic_percent": pct})
    return {
        "deployment_id": match(raw.get("id"), UUID),
        "created_at": match(raw.get("created_on"), TIME),
        "versions": versions,
    }

def snapshot(get, worker):
    report = {"schema": 1, "observed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
              "deployment_read": "ok", "build_read": "ok", "version_build_read": "ok",
              "active_deployment": None, "recent_deployments": [], "recent_builds": [],
              "active_version_builds": {}}
    try:
        raw = records(get("/workers/scripts/" + urllib.parse.quote(worker, safe="") + "/deployments",
                          {"per_page": 10}), "deployments")
        report["recent_deployments"] = [safe_deployment(d) for d in raw[:10]]
        if raw:
            report["active_deployment"] = report["recent_deployments"][0]
    except MonitorError as e:
        report["deployment_read"] = str(e)
    try:
        scripts = records(get("/workers/scripts"), "scripts")
        tag = next((match(obj(x).get("tag"), r"[0-9a-fA-F]{32}") for x in scripts
                    if obj(x).get("id") == worker), None)
        if not tag:
            raise MonitorError("worker_tag_not_found")
        raw = records(get("/builds/workers/" + tag + "/builds", {"per_page": 20}), "builds")
        report["recent_builds"] = [safe_build(b) for b in raw[:20]]
    except MonitorError as e:
        report["build_read"] = str(e)
    active = report["active_deployment"] or {}
    ids = [v["version_id"] for v in active.get("versions", [])][:20]
    if ids:
        try:
            data = get("/builds/builds", {"version_ids": ",".join(ids)})
            builds = obj(obj(data).get("builds"))
            report["active_version_builds"] = {v: safe_build(builds[v]) for v in ids
                                               if isinstance(builds.get(v), dict)}
            if len(report["active_version_builds"]) != len(ids):
                report["version_build_read"] = "partial_or_unmapped"
        except MonitorError as e:
            report["version_build_read"] = str(e)
    else:
        report["version_build_read"] = "no_active_versions"
    return report

def self_test():
    vid = "12345678-1234-1234-1234-123456789abc"
    sha = "a" * 40
    build = {"build_uuid": vid, "status": "stopped", "build_outcome": "success",
             "build_trigger_metadata": {"branch": "main", "commit_hash": sha,
                                        "environment_variables": {"SECRET": "DO_NOT_PRINT"}},
             "author": "DO_NOT_PRINT"}
    def fake(path, query=None):
        if path.endswith("/deployments"):
            return {"deployments": [{"id": vid, "versions": [{"version_id": vid, "percentage": 100}],
                                    "author_email": "DO_NOT_PRINT"}]}
        if path == "/workers/scripts":
            return [{"id": "pocket-works", "tag": "b" * 32}]
        if path.endswith("/builds") and "/workers/" in path:
            return [build]
        if path == "/builds/builds":
            assert query == {"version_ids": vid}
            return {"builds": {vid: build}}
        raise AssertionError(path)
    r = snapshot(fake, "pocket-works")
    assert r["active_version_builds"][vid]["commit_sha"] == sha
    assert r["recent_builds"][0]["outcome"] == "success"
    assert r["active_deployment"]["versions"][0]["traffic_percent"] == 100
    assert "DO_NOT_PRINT" not in json.dumps(r)
    assert safe_build({"status": "::error::bad", "build_trigger_metadata": {"commit_hash": "bad"}})["status"] is None
    def forbidden(path, query=None):
        if path.endswith("/deployments"):
            return fake(path, query)
        raise MonitorError("http_403")
    r = snapshot(forbidden, "pocket-works")
    assert r["deployment_read"] == "ok" and r["build_read"] == "http_403"
    assert r["version_build_read"] == "http_403"
    print("Cloudflare monitor contract tests passed")

def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        return 0
    account, token, worker = (os.environ.get(k, "") for k in
                               ("CF_ACCOUNT_ID", "CF_READ_TOKEN", "CF_WORKER_NAME"))
    if not match(account, r"[0-9a-fA-F]{32}") or not token or worker != "pocket-works":
        print("Cloudflare monitor configuration missing or invalid", file=sys.stderr)
        return 1
    report = snapshot(api_reader(account, token), worker)
    data = json.dumps(report, indent=2, allow_nan=False)
    print(data)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("## Cloudflare read-only deployment snapshot\n\n")
            f.write("The active deployment is independent of the GitHub CI result.\n\n")
            f.write("~~~json\n" + data + "\n~~~\n")
    return 0 if report["deployment_read"] == "ok" and report["build_read"] == "ok" else 1

if __name__ == "__main__":
    sys.exit(main())
