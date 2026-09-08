import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APPS = ROOT / "apps"
VERIFY = ROOT / "tools" / "asset-forge" / "verify_glb.py"
GENERATED_LIST = ROOT / ".asset-forge-generated.txt"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blender", required=True)
    parser.add_argument("--app")
    parser.add_argument("--changed-from")
    return parser.parse_args()


def inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def all_manifests() -> list[Path]:
    return sorted(APPS.glob("*/asset-forge/manifest.json"))


def changed_manifests(base: str) -> list[Path]:
    if not base or set(base) == {"0"}:
        return all_manifests()

    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", base, "HEAD", "--", "apps/*/asset-forge/**"],
            cwd=ROOT,
            check=True,
            text=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError:
        return all_manifests()

    slugs: set[str] = set()
    for line in result.stdout.splitlines():
        parts = Path(line).parts
        if len(parts) >= 3 and parts[0] == "apps" and parts[2] == "asset-forge":
            slugs.add(parts[1])

    return [APPS / slug / "asset-forge" / "manifest.json" for slug in sorted(slugs)]


def discover(args: argparse.Namespace) -> list[Path]:
    if args.app:
        manifest = APPS / args.app / "asset-forge" / "manifest.json"
        return [manifest]
    if args.changed_from:
        return changed_manifests(args.changed_from)
    return all_manifests()


def run_manifest(blender: Path, manifest_path: Path) -> list[Path]:
    if not manifest_path.exists():
        print(f"Asset Forge: no manifest at {manifest_path.relative_to(ROOT)}, skipping")
        return []

    app_dir = manifest_path.parents[1].resolve()
    forge_dir = manifest_path.parent.resolve()
    if not inside(app_dir, APPS):
        raise RuntimeError(f"Manifest is outside apps/: {manifest_path}")

    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if data.get("version") != 1:
        raise RuntimeError(f"Unsupported Asset Forge manifest version in {manifest_path}")

    jobs = data.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise RuntimeError(f"Manifest must contain at least one job: {manifest_path}")

    outputs: list[Path] = []
    for index, job in enumerate(jobs, start=1):
        if not isinstance(job, dict):
            raise RuntimeError(f"Job {index} must be an object")

        name = str(job.get("name") or f"job-{index}")
        script = (forge_dir / str(job.get("script", ""))).resolve()
        output = (app_dir / str(job.get("output", ""))).resolve()

        if not inside(script, forge_dir) or not script.is_file() or script.suffix != ".py":
            raise RuntimeError(f"{name}: script must be a .py file inside {forge_dir}")
        if not inside(output, app_dir):
            raise RuntimeError(f"{name}: output must stay inside {app_dir}")
        if output.suffix.lower() not in {".glb", ".blend"}:
            raise RuntimeError(f"{name}: v1 outputs must be .glb or .blend")

        output.parent.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env["ASSET_FORGE_OUTPUT"] = str(output)
        env["POCKET_WORKS_ROOT"] = str(ROOT)

        print(f"Asset Forge: building {name} -> {output.relative_to(ROOT)}")
        subprocess.run(
            [
                str(blender),
                "--background",
                "--factory-startup",
                "--python",
                str(script),
                "--",
                "--output",
                str(output),
            ],
            cwd=ROOT,
            env=env,
            check=True,
        )

        if not output.exists() or output.stat().st_size == 0:
            raise RuntimeError(f"{name}: Blender did not create {output}")

        if output.suffix.lower() == ".glb":
            verify_args = [
                str(blender),
                "--background",
                "--factory-startup",
                "--python",
                str(VERIFY),
                "--",
                "--input",
                str(output),
            ]
            if bool(job.get("requireArmature")):
                verify_args.append("--require-armature")
            if bool(job.get("requireAnimation")):
                verify_args.append("--require-animation")
            subprocess.run(verify_args, cwd=ROOT, check=True)

        outputs.append(output)

    return outputs


def main() -> None:
    args = parse_args()
    blender = Path(args.blender).resolve()
    if not blender.exists():
        raise RuntimeError(f"Blender executable not found: {blender}")

    manifests = discover(args)
    print(f"Asset Forge: discovered {len(manifests)} manifest(s)")

    outputs: list[Path] = []
    for manifest in manifests:
        outputs.extend(run_manifest(blender, manifest))

    relative = sorted({str(path.resolve().relative_to(ROOT)) for path in outputs})
    GENERATED_LIST.write_text("\n".join(relative) + ("\n" if relative else ""), encoding="utf-8")
    print(f"Asset Forge: generated {len(relative)} output(s)")


if __name__ == "__main__":
    main()
