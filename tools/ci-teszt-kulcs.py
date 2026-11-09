#!/usr/bin/env python3
"""The test app's signing key, derived from a passphrase (GitHub secret FOGASNAPLO_TESZT_SEED).

The same passphrase always gives the same key and the same certificate, so test builds keep updating each other
no matter how long the repo sits idle (the old Actions-cache key was evicted after 7 days and broke updates).
Only for hu.fogasnaplo.app.teszt. The real app's key is never derived or stored like this.

usage: ci-teszt-kulcs.py <out-dir>      (passphrase in the FOGASNAPLO_TESZT_SEED environment variable)
writes <out-dir>/fogasnaplo.keystore (PKCS12, alias fogasnaplo) and <out-dir>/keystore-jelszo.txt, prints the cert SHA-256.
"""
import datetime, hashlib, os, sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID


class Stream:
    """Deterministic bytes from the passphrase (SHAKE-256 in counter mode)."""
    def __init__(self, seed): self.seed, self.n = seed, 0
    def bytes(self, k):
        self.n += 1
        return hashlib.shake_256(self.seed + b"|" + str(self.n).encode()).digest(k)


SMALL = [p for p in range(3, 2000) if all(p % q for q in range(2, int(p ** .5) + 1))]


def probable_prime(n, rnd):
    if any(n % p == 0 for p in SMALL): return n in SMALL
    d, s = n - 1, 0
    while d % 2 == 0: d, s = d // 2, s + 1
    for _ in range(40):
        a = 2 + int.from_bytes(rnd.bytes(len(str(n))), "big") % (n - 3)
        x = pow(a, d, n)
        if x in (1, n - 1): continue
        for _ in range(s - 1):
            x = pow(x, 2, n)
            if x == n - 1: break
        else: return False
    return True


def prime(bits, rnd, e):
    while True:
        c = int.from_bytes(rnd.bytes(bits // 8), "big") | (3 << (bits - 2)) | 1  # top two bits set: n has exactly 2*bits bits
        if (c - 1) % e and probable_prime(c, rnd): return c


def main():
    seed = os.environ.get("FOGASNAPLO_TESZT_SEED", "").strip().encode()
    if len(seed) < 12: sys.exit("FOGASNAPLO_TESZT_SEED is missing or shorter than 12 characters")
    out = sys.argv[1]
    rnd, e = Stream(b"kapas-teszt-v1|" + seed), 65537
    p = prime(1024, rnd, e)
    q = prime(1024, rnd, e)
    while q == p: q = prime(1024, rnd, e)
    p, q = max(p, q), min(p, q)
    n, d = p * q, pow(e, -1, (p - 1) * (q - 1))
    key = rsa.RSAPrivateNumbers(p, q, d, d % (p - 1), d % (q - 1), pow(q, -1, p), rsa.RSAPublicNumbers(e, n)).private_key()

    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Kapas teszt (CI)")])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(int.from_bytes(rnd.bytes(16), "big") >> 1 | 1)
            .not_valid_before(datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc))
            .not_valid_after(datetime.datetime(2075, 12, 31, tzinfo=datetime.timezone.utc))
            .sign(key, hashes.SHA256()))  # RSA PKCS#1 v1.5: deterministic, so the certificate is byte-identical every run

    pw = hashlib.sha256(b"kapas-teszt-pw|" + seed).hexdigest()[:24]
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "fogasnaplo.keystore"), "wb") as f:
        f.write(pkcs12.serialize_key_and_certificates(b"fogasnaplo", key, cert, None,
                                                      serialization.BestAvailableEncryption(pw.encode())))
    with open(os.path.join(out, "keystore-jelszo.txt"), "w") as f: f.write(pw + "\n")
    print(hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest())


if __name__ == "__main__":
    main()
