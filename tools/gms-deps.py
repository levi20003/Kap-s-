#!/usr/bin/env python3
"""Resolves the Maven dependencies of the Google sign-in library (play-services-auth) for build.sh, which has no Gradle.

usage: gms-deps.py resolve <group:artifact:version>   -> prints the resolved list (group:artifact:version:packaging)
       gms-deps.py fetch <lockfile> <dir>            -> downloads every entry of the lock file into <dir>, checks sha256

The lock file (tools/gms-deps.lock) is committed: builds use exactly those files, checked against their sha256.
"""
import hashlib, os, re, sys, urllib.request, xml.etree.ElementTree as ET

REPOS = ["https://maven.google.com/", "https://repo1.maven.org/maven2/"]
NS = {"m": "http://maven.apache.org/POM/4.0.0"}

def get(path):
    last = None
    for r in REPOS:
        try:
            with urllib.request.urlopen(urllib.request.Request(r + path, headers={"User-Agent": "kapas-build"}), timeout=60) as f:
                return f.read()
        except Exception as e:
            last = e
    raise RuntimeError(f"{path}: {last}")

def path_of(g, a, v, ext):
    return f"{g.replace('.', '/')}/{a}/{v}/{a}-{v}.{ext}"

def vkey(v):
    return [int(x) if x.isdigit() else x for x in re.split(r"[.\-]", re.sub(r"[\[\]()]", "", v.split(",")[0]))]

def pom(g, a, v):
    root = ET.fromstring(get(path_of(g, a, v, "pom")))
    pack = root.findtext("m:packaging", "jar", NS)
    deps = []
    for d in root.findall("m:dependencies/m:dependency", NS):
        scope = d.findtext("m:scope", "compile", NS)
        if scope not in ("compile", "runtime") or d.findtext("m:optional", "false", NS) == "true": continue
        ver = d.findtext("m:version", "", NS).strip()
        if not ver or "$" in ver: continue
        deps.append((d.findtext("m:groupId", "", NS), d.findtext("m:artifactId", "", NS), re.sub(r"[\[\]()]", "", ver.split(",")[0])))
    return pack, deps

def resolve(root):
    best, packs, todo = {}, {}, [tuple(root.split(":"))]
    while todo:
        g, a, v = todo.pop()
        k = (g, a)
        if k in best and vkey(best[k]) >= vkey(v): continue
        best[k] = v
        pack, deps = pom(g, a, v)
        packs[k] = "aar" if pack == "aar" else "jar"
        todo.extend(deps)
    return sorted(f"{g}:{a}:{v}:{packs[(g, a)]}" for (g, a), v in best.items())

def fetch(lock, out):
    os.makedirs(out, exist_ok=True)
    for line in open(lock):
        line = line.strip()
        if not line or line.startswith("#"): continue
        coord, sha = line.split()
        g, a, v, ext = coord.split(":")
        dst = os.path.join(out, f"{g}.{a}-{v}.{ext}")
        if not (os.path.exists(dst) and hashlib.sha256(open(dst, "rb").read()).hexdigest() == sha):
            data = get(path_of(g, a, v, ext))
            if hashlib.sha256(data).hexdigest() != sha: sys.exit(f"sha256 mismatch: {coord}")
            open(dst, "wb").write(data)
    print(out)

if __name__ == "__main__":
    if sys.argv[1] == "resolve":
        for c in resolve(sys.argv[2]): print(c)
    elif sys.argv[1] == "lock":  # resolve + download + print lock lines
        for c in resolve(sys.argv[2]):
            g, a, v, ext = c.split(":")
            print(c, hashlib.sha256(get(path_of(g, a, v, ext))).hexdigest())
    else:
        fetch(sys.argv[2], sys.argv[3])
